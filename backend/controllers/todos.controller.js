const db = require('../config/db');

function statusWhere(status) {
  if (status === 'open') return 'WHERE t.completed = false';
  if (status === 'completed' || status === 'history') return 'WHERE t.completed = true';
  return '';
}

function ownerLabel(body) {
  if (body.owner_type === 'everyone') return 'Everyone';
  if (body.owner_type === 'hr') return 'HR';
  if (body.owner_type === 'managers') return 'Managers';
  return 'Employee';
}

function validateTodo(body) {
  if (!body.title || !body.title.trim()) return 'Title is required';
  if (!['everyone', 'hr', 'managers', 'employee'].includes(body.owner_type)) return 'Assignment is required';
  if (body.owner_type === 'employee' && !body.assigned_employee_id) return 'Select an employee';
  if (body.priority && !['Low', 'Normal', 'Medium', 'High'].includes(body.priority)) return 'Invalid priority';
  return null;
}

exports.getTodos = async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const scope = req.query.scope || 'all';
    const clauses = ['t.company_id = $1'];
    if (status === 'open') clauses.push('t.completed = false');
    if (status === 'completed' || status === 'history') clauses.push('t.completed = true');
    if (scope === 'mine') {
      clauses.push(`(
        t.owner_type = 'everyone'
        OR (t.owner_type IN ('hr','managers') AND $2 = ANY(ARRAY['admin','manager']))
        OR (t.owner_type = 'employee' AND t.assigned_employee_id = $3)
      )`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const { rows } = await db.query(
      `SELECT t.*,
              COALESCE(CONCAT(a.first_name, ' ', a.last_name), t.owner) AS owner,
              CONCAT(a.first_name, ' ', a.last_name) AS assigned_employee_name,
              CONCAT(e.first_name, ' ', e.last_name) AS completed_by_name
       FROM todos t
       LEFT JOIN employees e ON e.id = t.completed_by
       LEFT JOIN employees a ON a.id = t.assigned_employee_id
       ${scope === 'mine' ? where : `WHERE t.company_id = $1${statusWhere(status).replace('WHERE', ' AND')}`}
       ORDER BY t.completed ASC, t.completed_at DESC NULLS LAST, t.due_date ASC NULLS LAST, t.created_at DESC`,
      scope === 'mine' ? [req.user.company_id, req.user.role, req.user.id] : [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch to do list' });
  }
};

exports.createTodo = async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const validation = validateTodo(req.body);
    if (validation) return res.status(400).json({ error: validation });
    const { title, detail, owner_type, assigned_employee_id, due_date, priority, link } = req.body;
    const { rows } = await db.query(
      `INSERT INTO todos (company_id, title, detail, owner, owner_type, assigned_employee_id, due_date, priority, link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.company_id,
        title.trim(),
        detail || '',
        ownerLabel(req.body),
        owner_type,
        owner_type === 'employee' ? assigned_employee_id : null,
        due_date || null,
        priority || 'Normal',
        link || ''
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create to do item' });
  }
};

exports.updateTodo = async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const validation = validateTodo(req.body);
    if (validation) return res.status(400).json({ error: validation });
    const { title, detail, owner_type, assigned_employee_id, due_date, priority, link } = req.body;
    const { rows } = await db.query(
      `UPDATE todos
       SET title=$1, detail=$2, owner=$3, owner_type=$4, assigned_employee_id=$5, due_date=$6, priority=$7, link=$8
       WHERE id=$9 AND company_id=$10
       RETURNING *`,
      [
        title.trim(),
        detail || '',
        ownerLabel(req.body),
        owner_type,
        owner_type === 'employee' ? assigned_employee_id : null,
        due_date || null,
        priority || 'Normal',
        link || '',
        req.params.id,
        req.user.company_id
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'To do item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update to do item' });
  }
};

exports.deleteTodo = async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const { rowCount } = await db.query('DELETE FROM todos WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!rowCount) return res.status(404).json({ error: 'To do item not found' });
    res.json({ message: 'To do item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete to do item' });
  }
};

exports.completeTodo = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE todos
       SET completed=true, completed_by=$1, completed_at=NOW()
       WHERE id=$2 AND company_id=$3
       RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'To do item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not complete to do item' });
  }
};

exports.reopenTodo = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE todos
       SET completed=false, completed_by=NULL, completed_at=NULL
       WHERE id=$1 AND company_id=$2
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'To do item not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not reopen to do item' });
  }
};
