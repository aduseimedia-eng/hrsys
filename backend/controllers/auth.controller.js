// controllers/auth.controller.js
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'hr_secret_key_change_in_prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// First-time setup: create the initial company and HR administrator.
// This route is intentionally locked after the first employee account exists.
exports.setup = async (req, res) => {
  const client = await db.getClient();
  try {
    const companyName = String(req.body.company_name || '').trim();
    const fullName = String(req.body.full_name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const [firstName, ...lastNameParts] = fullName.split(/\s+/);
    const lastName = lastNameParts.join(' ');

    if (!companyName || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Company name, full name, email and password are required' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    await client.query('BEGIN');
    await client.query('LOCK TABLE employees IN ACCESS EXCLUSIVE MODE');
    // Legacy sample companies do not count as a real organization setup.
    const existing = await client.query(
      `SELECT 1
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       WHERE c.slug NOT IN ('hrconnect-demo', 'kenad-hr-demo')
       LIMIT 1`
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'KenadHR has already been set up. Contact your HR administrator for an account.' });
    }

    const slugBase = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'kenadhr';
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const company = await client.query(
      'INSERT INTO companies (name, slug, email) VALUES ($1,$2,$3) RETURNING id, name, slug',
      [companyName, slug, email]
    );
    const hash = await bcrypt.hash(password, 12);
    const employee = await client.query(
      `INSERT INTO employees (company_id, first_name, last_name, email, password_hash, role, is_active)
       VALUES ($1,$2,$3,$4,$5,'admin',true)
       RETURNING id, company_id, first_name, last_name, email, role, department_id, photo_url, is_active`,
      [company.rows[0].id, firstName, lastName, email, hash]
    );
    await client.query('COMMIT');

    const user = employee.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token, user, company: company.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'That company name or email is already in use' });
    console.error('Initial setup error:', err);
    res.status(500).json({ error: 'Could not complete initial setup' });
  } finally {
    client.release();
  }
};

// ─── Login ────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await db.query(
      `SELECT id, company_id, first_name, last_name, email, password_hash, role,
              department_id, photo_url, is_active
       FROM employees WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const employee = rows[0];
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });
    if (!employee.is_active) return res.status(403).json({ error: 'Account is deactivated' });

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: employee.id, role: employee.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const { password_hash, ...userSafe } = employee;
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await db.query(
      `SELECT id, company_id, first_name, last_name, email, password_hash, role,
              department_id, photo_url, is_active
       FROM employees WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const employee = rows[0];
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });
    if (!employee.is_active) return res.status(403).json({ error: 'Account is deactivated' });
    if (employee.role === 'admin') return res.status(403).json({ error: 'Please use the HR/Admin sign in page for this account' });

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: employee.id, role: employee.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const { password_hash, ...userSafe } = employee;
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Staff login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
};

// ─── Get current user profile ─────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.company_id, c.name AS company_name, c.slug AS company_slug,
              e.first_name, e.last_name, e.email, e.role, e.job_title,
              e.phone, e.address, e.date_of_birth, e.hire_date, e.photo_url,
              e.education_information, e.education_level, e.education_institution,
              e.education_field, e.graduation_year, e.experience,
              e.previous_company, e.previous_job_title, e.experience_years, e.experience_summary,
              e.emergency_contact_name, e.emergency_contact_relationship,
              e.emergency_contact_phone, e.emergency_contact_address,
              e.bank_name, e.bank_account_name, e.bank_account_number, e.bank_branch,
              e.salary, e.department_id, e.manager_id, e.created_at,
              d.name AS department_name,
              CONCAT(m.first_name,' ',m.last_name) AS manager_name
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m   ON m.id = e.manager_id
       WHERE e.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
};

// ─── Change password ──────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const { rows } = await db.query('SELECT password_hash FROM employees WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE employees SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update password' });
  }
};

exports.changeEmail = async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await db.query('SELECT id FROM employees WHERE email = $1 AND id <> $2', [email, req.user.id]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const { rows } = await db.query(
      `UPDATE employees SET email=$1 WHERE id=$2
       RETURNING id, company_id, first_name, last_name, email, role, department_id, photo_url`,
      [email, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update email' });
  }
};
