// controllers/employee.controller.js
const bcrypt = require('bcrypt');
const db     = require('../config/db');
const EMPLOYMENT_TYPES = ['staff', 'contractual', 'national_service', 'internship'];

// ─── Dashboard stats (admin/manager) ─────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().getMonth() + 1;
    const year  = new Date().getFullYear();

    const [total, present, onLeave, payroll, birthdays, recent] = await Promise.all([
      db.query("SELECT COUNT(*) FROM employees WHERE company_id=$1 AND is_active = true", [req.user.company_id]),
      db.query("SELECT COUNT(*) FROM attendance WHERE company_id=$1 AND work_date = $2 AND status IN ('present','late')", [req.user.company_id, today]),
      db.query("SELECT COUNT(*) FROM leave_requests WHERE company_id=$1 AND status='approved' AND $2 BETWEEN start_date AND end_date", [req.user.company_id, today]),
      db.query("SELECT SUM(net_salary) as total FROM payroll WHERE company_id=$1 AND month=$2 AND year=$3 AND status IN ('processed','paid')", [req.user.company_id, month, year]),
      db.query(
        `SELECT id, first_name, last_name, photo_url, date_of_birth, job_title
         FROM employees
         WHERE company_id = $1
           AND is_active = true
           AND TO_CHAR(date_of_birth, 'MM-DD') BETWEEN TO_CHAR(NOW(),'MM-DD') AND TO_CHAR(NOW() + INTERVAL '30 days','MM-DD')
         ORDER BY TO_CHAR(date_of_birth,'MM-DD') LIMIT 5`,
        [req.user.company_id]
      ),
      db.query(
        `SELECT id, first_name, last_name, photo_url, job_title, hire_date
         FROM employees WHERE company_id = $1 AND is_active = true ORDER BY hire_date DESC LIMIT 5`,
        [req.user.company_id]
      )
    ]);

    res.json({
      total_employees:   parseInt(total.rows[0].count),
      present_today:     parseInt(present.rows[0].count),
      on_leave_today:    parseInt(onLeave.rows[0].count),
      payroll_this_month: parseFloat(payroll.rows[0].total || 0),
      upcoming_birthdays: birthdays.rows,
      recent_hires:       recent.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dashboard' });
  }
};

// ─── List all employees ───────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { department_id, role, employment_type, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.company_id];
    let where = 'WHERE e.company_id = $1 AND e.is_active = true';
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }
    if (role)          { params.push(role);          where += ` AND e.role = $${params.length}`; }
    if (employment_type) { params.push(employment_type); where += ` AND e.employment_type = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.email ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.role, e.employment_type, e.job_title,
              e.phone, e.hire_date, e.photo_url, e.salary,
              d.name AS department_name,
              CONCAT(m.first_name,' ',m.last_name) AS manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m   ON m.id = e.manager_id
       ${where}
       ORDER BY e.first_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM employees e ${where}`, countParams
    );

    if (req.user.role !== 'admin') {
      rows.forEach(emp => delete emp.salary);
    }

    res.json({ employees: rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch employees' });
  }
};

// ─── Get single employee ──────────────────────────────────────
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    // Employees can only view themselves unless admin/manager
    if (req.user.role === 'employee' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rows } = await db.query(
      `SELECT e.*, d.name AS department_name,
              CONCAT(m.first_name,' ',m.last_name) AS manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m   ON m.id = e.manager_id
       WHERE e.id = $1 AND e.company_id = $2`,
      [id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });

    const emp = rows[0];
    delete emp.password_hash;
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) delete emp.salary;
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch employee' });
  }
};

// ─── Create employee (admin only) ────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      first_name, last_name, email, password, role, employment_type, department_id,
      manager_id, job_title, salary, hire_date, phone, address, date_of_birth,
      education_information, education_level, education_institution, education_field, graduation_year,
      experience, previous_company, previous_job_title, experience_years, experience_summary,
      emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_address, bank_name, bank_account_name,
      bank_account_number, bank_branch
    } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (employment_type && !EMPLOYMENT_TYPES.includes(employment_type)) {
      return res.status(400).json({ error: 'Invalid employment type' });
    }

    const existing = await db.query('SELECT id FROM employees WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO employees (company_id, first_name, last_name, email, password_hash, role, employment_type,
        department_id, manager_id, job_title, salary, hire_date, phone, address, date_of_birth,
        education_information, education_level, education_institution, education_field, graduation_year,
        experience, previous_company, previous_job_title, experience_years, experience_summary,
        emergency_contact_name, emergency_contact_relationship,
        emergency_contact_phone, emergency_contact_address, bank_name, bank_account_name,
        bank_account_number, bank_branch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
       RETURNING id, first_name, last_name, email, role, job_title, hire_date`,
      [req.user.company_id, first_name, last_name, email.toLowerCase(), hash, role || 'employee', employment_type || 'staff',
       department_id || null, manager_id || null, job_title, salary || 0,
       hire_date || null, phone, address, date_of_birth || null,
       education_information || '', education_level || '', education_institution || '',
       education_field || '', graduation_year || '', experience || '', previous_company || '',
       previous_job_title || '', experience_years || '', experience_summary || '',
       emergency_contact_name || '',
       emergency_contact_relationship || '', emergency_contact_phone || '',
       emergency_contact_address || '', bank_name || '', bank_account_name || '',
       bank_account_number || '', bank_branch || '']
    );

    // Create welcome notification
    await db.query(
      "INSERT INTO notifications (company_id, employee_id, type, message) VALUES ($1,$2,'welcome',$3)",
      [req.user.company_id, rows[0].id, `Welcome to the team, ${first_name}! Your account has been created.`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create employee' });
  }
};

// ─── Update employee ──────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid employee id' });

    // Employees can update only their own non-sensitive fields
    const isOwn   = req.user.id === id;
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isOwn) return res.status(403).json({ error: 'Access denied' });

    const adminFields = [
      'first_name', 'last_name', 'phone', 'address', 'date_of_birth',
      'department_id', 'manager_id', 'job_title', 'salary', 'role', 'employment_type', 'hire_date',
      'education_information', 'education_level', 'education_institution', 'education_field', 'graduation_year',
      'experience', 'previous_company', 'previous_job_title', 'experience_years', 'experience_summary',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone', 'emergency_contact_address', 'bank_name', 'bank_account_name',
      'bank_account_number', 'bank_branch'
    ];
    const selfFields = [
      'first_name', 'last_name', 'phone', 'address', 'date_of_birth',
      'education_information', 'education_level', 'education_institution', 'education_field', 'graduation_year',
      'experience', 'previous_company', 'previous_job_title', 'experience_years', 'experience_summary',
      'emergency_contact_name', 'emergency_contact_relationship',
      'emergency_contact_phone', 'emergency_contact_address', 'bank_name', 'bank_account_name',
      'bank_account_number', 'bank_branch'
    ];
    const allowedFields = isAdmin ? adminFields : selfFields;
    const nullableFields = new Set(['date_of_birth', 'department_id', 'manager_id', 'hire_date', 'salary']);
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

      let value = req.body[field];
      if (typeof value === 'string') value = value.trim();
      if (nullableFields.has(field) && value === '') value = null;

      if (['first_name', 'last_name'].includes(field) && !value) {
        return res.status(400).json({ error: `${field.replace('_', ' ')} is required` });
      }
      if (field === 'role' && value && !['admin', 'manager', 'employee'].includes(value)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      if (field === 'employment_type' && value && !EMPLOYMENT_TYPES.includes(value)) {
        return res.status(400).json({ error: 'Invalid employment type' });
      }

      params.push(value);
      updates.push(`${field}=$${params.length}`);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    const { rows } = await db.query(
      `UPDATE employees SET ${updates.join(', ')} WHERE id=$${params.length} AND company_id=$${params.length + 1}
       RETURNING id, first_name, last_name, email, role, job_title, phone, address,
                 date_of_birth, hire_date, department_id, manager_id, salary, photo_url, employment_type,
                 education_information, education_level, education_institution, education_field, graduation_year,
                 experience, previous_company, previous_job_title, experience_years, experience_summary,
                 emergency_contact_name, emergency_contact_relationship,
                 emergency_contact_phone, emergency_contact_address, bank_name, bank_account_name,
                 bank_account_number, bank_branch`,
      [...params, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update employee' });
  }
};

// Admin: reset staff email/password
exports.resetAccount = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = [];
    const params = [];

    if (req.body.email) {
      const email = String(req.body.email).toLowerCase().trim();
      const existing = await db.query('SELECT id FROM employees WHERE email=$1 AND id<>$2', [email, id]);
      if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
      params.push(email);
      updates.push(`email=$${params.length}`);
    }

    if (req.body.password) {
      if (String(req.body.password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const hash = await bcrypt.hash(req.body.password, 12);
      params.push(hash);
      updates.push(`password_hash=$${params.length}`);
    }

    if (!updates.length) return res.status(400).json({ error: 'Email or password required' });
    params.push(id);
    const { rows } = await db.query(
      `UPDATE employees SET ${updates.join(', ')} WHERE id=$${params.length} AND company_id=$${params.length + 1}
       RETURNING id, first_name, last_name, email, role`,
      [...params, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset account' });
  }
};


// ─── Upload profile photo ─────────────────────────────────────
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const photoUrl = `/api/employees/photo/${req.user.id}`;
    await db.query(
      'UPDATE employees SET photo_url = $1, photo_data = $2, photo_mime_type = $3 WHERE id = $4 AND company_id = $5',
      [photoUrl, req.file.buffer, req.file.mimetype, req.user.id, req.user.company_id]
    );
    res.json({ photo_url: photoUrl });
  } catch (err) {
    res.status(500).json({ error: 'Could not save photo' });
  }
};

exports.getPhoto = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT photo_data, photo_mime_type FROM employees WHERE id = $1 AND photo_data IS NOT NULL',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(rows[0].photo_mime_type || 'image/jpeg').send(rows[0].photo_data);
  } catch (err) {
    res.status(500).end();
  }
};

// ─── Deactivate employee (admin only) ────────────────────────
exports.deactivate = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    const { rowCount } = await db.query(
      'UPDATE employees SET is_active = false WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not deactivate employee' });
  }
};

// ─── Get departments ──────────────────────────────────────────
// Lightweight employee directory for people-pickers and messaging.
exports.getDirectory = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, photo_url, job_title, role, employment_type, department_id
       FROM employees
       WHERE company_id = $1 AND is_active = true
       ORDER BY first_name, last_name`
      ,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch employee directory' });
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, CONCAT(e.first_name,' ',e.last_name) AS manager_name,
              COUNT(emp.id) AS employee_count
       FROM departments d
       LEFT JOIN employees e   ON e.id = d.manager_id
       LEFT JOIN employees emp ON emp.department_id = d.id AND emp.is_active = true
       WHERE d.company_id = $1
       GROUP BY d.id, e.first_name, e.last_name
       ORDER BY d.name`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch departments' });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const managerId = req.body.manager_id || null;
    if (!name) return res.status(400).json({ error: 'Department name is required' });

    const existing = await db.query('SELECT id FROM departments WHERE company_id=$1 AND LOWER(name)=LOWER($2)', [req.user.company_id, name]);
    if (existing.rows.length) return res.status(409).json({ error: 'Department already exists' });

    const { rows } = await db.query(
      `INSERT INTO departments (company_id, name, manager_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.company_id, name, managerId || null]
    );
    res.status(201).json({ ...rows[0], manager_name: null, employee_count: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Could not create department' });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid department id' });

    const { rows } = await db.query('DELETE FROM departments WHERE id=$1 AND company_id=$2 RETURNING id, name', [id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deleted', department: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete department' });
  }
};
