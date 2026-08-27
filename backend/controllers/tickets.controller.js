const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];
const CATEGORIES = ['laptop', 'email', 'access', 'software', 'network', 'hr_system', 'other'];

function validateTicket(body) {
  if (!body.subject || !body.subject.trim()) return 'Subject is required';
  if (!body.description || !body.description.trim()) return 'Description is required';
  if (body.category && !CATEGORIES.includes(body.category)) return 'Invalid category';
  if (body.priority && !PRIORITIES.includes(body.priority)) return 'Invalid priority';
  return null;
}

function generateTicketNumber() {
  const year = new Date().getFullYear();
  const letters = Math.random().toString(36).slice(2, 5).toUpperCase();
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `IT-${year}#${letters}-${digits}`;
}

async function getItDepartmentRecipients(companyId) {
  const { rows } = await db.query(
    `SELECT DISTINCT e.id
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.is_active = true
       AND e.company_id = $1
       AND (
         d.name = 'IT Department'
         OR e.id IN (SELECT manager_id FROM departments WHERE company_id = $1 AND name = 'IT Department' AND manager_id IS NOT NULL)
       )`,
    [companyId]
  );
  return rows;
}

async function isItDepartmentUser(userId, companyId) {
  const { rows } = await db.query(
    `SELECT e.id
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = $1
       AND e.company_id = $2
       AND e.is_active = true
       AND (
         d.name = 'IT Department'
         OR e.id IN (SELECT manager_id FROM departments WHERE company_id = $2 AND name = 'IT Department' AND manager_id IS NOT NULL)
       )`,
    [userId, companyId]
  );
  return rows.length > 0;
}

async function isItDepartmentMember(userId, companyId) {
  const { rows } = await db.query(
    `SELECT e.id
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.id = $1
       AND e.company_id = $2
       AND e.is_active = true
       AND (
         d.name = 'IT Department'
         OR e.id IN (SELECT manager_id FROM departments WHERE company_id = $2 AND name = 'IT Department' AND manager_id IS NOT NULL)
       )`,
    [userId, companyId]
  );
  return rows.length > 0;
}

exports.createTicket = async (req, res) => {
  try {
    if (await isItDepartmentMember(req.user.id, req.user.company_id)) {
      return res.status(403).json({ error: 'IT Department users can view and complete staff support requests, but cannot submit them' });
    }
    const validation = validateTicket(req.body);
    if (validation) return res.status(400).json({ error: validation });
    const { category = 'other', priority = 'medium', subject, description } = req.body;
    let ticketNumber = generateTicketNumber();
    let rows;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await db.query(
          `INSERT INTO it_tickets (company_id, ticket_number, employee_id, category, priority, subject, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [req.user.company_id, ticketNumber, req.user.id, category, priority, subject.trim(), description.trim()]
        );
        rows = result.rows;
        break;
      } catch (err) {
        if (err.code !== '23505' || attempt === 4) throw err;
        ticketNumber = generateTicketNumber();
      }
    }
    const staffName = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || 'A staff member';
    const managers = await getItDepartmentRecipients(req.user.company_id);
    await Promise.all(managers.map((manager) => notifyEmployee({
      companyId: req.user.company_id,
      employeeId: manager.id,
      type: 'it_ticket',
      message: `${staffName} submitted a support request.`,
      link: '/pages/workspace.html#tickets'
    })));
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create ticket' });
  }
};

exports.getMine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name
       FROM it_tickets t
       JOIN employees e ON e.id = t.employee_id
       WHERE t.employee_id=$1 AND t.company_id=$2
       ORDER BY t.created_at DESC`,
      [req.user.id, req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch tickets' });
  }
};

exports.getAll = async (req, res) => {
  try {
    if (!await isItDepartmentUser(req.user.id, req.user.company_id)) return res.status(403).json({ error: 'Only the IT Department can view submitted support requests' });
    const status = req.query.status;
    const priority = req.query.priority;
    const params = [];
    const clauses = [];
    if (status) {
      params.push(status);
      clauses.push(`t.status=$${params.length}`);
    }
    if (priority) {
      params.push(priority);
      clauses.push(`t.priority=$${params.length}`);
    }
    params.push(req.user.company_id);
    clauses.push(`t.company_id=$${params.length}`);
    const where = `WHERE ${clauses.join(' AND ')}`;
    const { rows } = await db.query(
      `SELECT t.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.email, e.job_title
       FROM it_tickets t
       JOIN employees e ON e.id = t.employee_id
       ${where}
       ORDER BY
         CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
         CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch tickets' });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    if (!await isItDepartmentUser(req.user.id, req.user.company_id)) return res.status(403).json({ error: 'Only the IT Department can update support requests' });
    const status = req.body.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await db.query(
      `UPDATE it_tickets
       SET status=$1, response=$2, updated_at=NOW(), resolved_at=CASE WHEN $1 IN ('resolved','closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
       WHERE id=$3 AND company_id=$4
       RETURNING *`,
      [status, req.body.response || '', req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    await notifyEmployee({
      companyId: req.user.company_id,
      employeeId: rows[0].employee_id,
      type: 'it_ticket',
      message: `Your support request "${rows[0].subject}" is now ${status === 'resolved' ? 'completed' : status.replace('_', ' ')}.`,
      link: '/pages/staff-portal.html#tickets'
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update ticket' });
  }
};
