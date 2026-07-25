// controllers/auth.controller.js
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../config/db');
const { findPlan, currency } = require('../config/billing');

const JWT_SECRET  = process.env.JWT_SECRET  || 'hr_secret_key_change_in_prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const otpEnabled = () => process.env.OTP_ENABLED === 'true';

function normalizeGhanaPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return digits;
  return null;
}

function setupDetails(body) {
  const companyName = String(body.company_name || '').trim();
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');
  const planKey = String(body.plan_key || '').trim().toLowerCase();
  const [firstName, ...lastNameParts] = fullName.split(/\s+/);
  return { companyName, fullName, email, password, planKey, firstName, lastName: lastNameParts.join(' ') };
}

function validateSetupDetails(details) {
  if (!details.companyName || !details.firstName || !details.lastName || !details.email || !details.password) {
    return 'Company name, full name, email and password are required';
  }
  if (details.password.length < 8) return 'Password must be at least 8 characters';
  if (!details.planKey) return 'Choose an annual plan before creating your account';
  if (!findPlan(details.planKey)) return 'Choose a valid annual plan';
  return null;
}

async function noExistingSetup(client) {
  const existing = await client.query(
    `SELECT 1
     FROM employees e
     JOIN companies c ON c.id = e.company_id
     WHERE c.slug NOT IN ('hrconnect-demo', 'kenad-hr-demo')
     LIMIT 1`
  );
  return !existing.rows.length;
}

async function createInitialAdmin(client, details, passwordHash) {
  await client.query('BEGIN');
  await client.query('LOCK TABLE employees IN ACCESS EXCLUSIVE MODE');
  if (!(await noExistingSetup(client))) {
    await client.query('ROLLBACK');
    return null;
  }
  const slugBase = details.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'kenadhr';
  const slug = `${slugBase}-${Date.now().toString(36)}`;
  const company = await client.query(
    'INSERT INTO companies (name, slug, email) VALUES ($1,$2,$3) RETURNING id, name, slug',
    [details.companyName, slug, details.email]
  );
  const employee = await client.query(
    `INSERT INTO employees (company_id, first_name, last_name, email, password_hash, role, phone, is_active)
     VALUES ($1,$2,$3,$4,$5,'admin',$6,true)
     RETURNING id, company_id, first_name, last_name, email, role, department_id, photo_url, is_active`,
    [company.rows[0].id, details.firstName, details.lastName, details.email, passwordHash, details.phone || null]
  );
  const plan = findPlan(details.planKey);
  await client.query(
    `INSERT INTO company_subscriptions (company_id, plan_key, status, amount, currency)
     VALUES ($1,$2,'pending',$3,$4)`,
    [company.rows[0].id, plan.key, plan.amount, currency()]
  );
  await client.query('COMMIT');
  return { user: employee.rows[0], company: company.rows[0] };
}

async function callVynfy(path, payload) {
  if (!process.env.VYNFY_API_KEY) {
    const error = new Error('Phone verification is not configured yet');
    error.status = 503;
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://sms.vynfy.com${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': process.env.VYNFY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.message || body.error || 'Vynfy could not verify the code');
      error.status = response.status === 401 || response.status === 403 ? 502 : 400;
      throw error;
    }
    return response.json().catch(() => ({}));
  } catch (err) {
    if (err.status) throw err;
    const error = new Error('Could not reach Vynfy for phone verification. Please try again.');
    error.status = 502;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// First-time setup: create the initial company and HR administrator.
// This route is intentionally locked after the first employee account exists.
exports.setup = async (req, res) => {
  const client = await db.getClient();
  try {
    if (otpEnabled() && process.env.VYNFY_API_KEY) return res.status(403).json({ error: 'Verify your phone number to create the HR account' });
    const details = setupDetails(req.body);
    const validationError = validateSetupDetails(details);
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await createInitialAdmin(client, details, await bcrypt.hash(details.password, 12));
    if (!result) return res.status(409).json({ error: 'KenadHR has already been set up. Contact your HR administrator for an account.' });
    const token = jwt.sign({ id: result.user.id, role: result.user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token, user: result.user, company: result.company });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'That company name or email is already in use' });
    console.error('Initial setup error:', err);
    res.status(500).json({ error: 'Could not complete initial setup' });
  } finally {
    client.release();
  }
};

// First-time HR setup: request an SMS verification code before any account is created.
exports.requestSetupOtp = async (req, res) => {
  const client = await db.getClient();
  try {
    if (!otpEnabled()) return res.status(404).json({ error: 'Route not found' });
    const details = setupDetails(req.body);
    const validationError = validateSetupDetails(details);
    const phone = normalizeGhanaPhone(req.body.phone);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!phone) return res.status(400).json({ error: 'Enter a valid Ghana phone number' });
    if (!(await noExistingSetup(client))) {
      return res.status(409).json({ error: 'KenadHR has already been set up. Contact your HR administrator for an account.' });
    }
    const recent = await client.query(
      "SELECT COUNT(*) FROM hr_signup_otps WHERE phone=$1 AND created_at > NOW() - INTERVAL '15 minutes'",
      [phone]
    );
    if (Number(recent.rows[0].count) >= 3) {
      return res.status(429).json({ error: 'Too many verification requests. Please wait a few minutes.' });
    }

    await callVynfy('/otp/generate', {
      expiry: 5,
      length: 6,
      medium: 'sms',
      message: 'Your KenadHR verification code is %otp_code%. It expires in 5 minutes.',
      number: phone,
      otp_type: 'number',
      sender_id: process.env.VYNFY_SENDER_ID || 'KenadHR'
    });

    const signupId = crypto.randomUUID();
    await client.query(
      `INSERT INTO hr_signup_otps (id, company_name, full_name, email, phone, password_hash, plan_key, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '5 minutes')`,
      [signupId, details.companyName, details.fullName, details.email, phone, await bcrypt.hash(details.password, 12), details.planKey]
    );
    res.status(201).json({ signup_id: signupId, message: 'Verification code sent' });
  } catch (err) {
    console.error('HR signup OTP request error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not send verification code' });
  } finally {
    client.release();
  }
};

exports.verifySetupOtp = async (req, res) => {
  const client = await db.getClient();
  try {
    if (!otpEnabled()) return res.status(404).json({ error: 'Route not found' });
    const signupId = String(req.body.signup_id || '').trim();
    const code = String(req.body.code || '').trim();
    if (!signupId || !/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'Enter the verification code sent to your phone' });
    const pending = await client.query(
      'SELECT * FROM hr_signup_otps WHERE id=$1 AND expires_at > NOW()',
      [signupId]
    );
    if (!pending.rows.length) return res.status(400).json({ error: 'This verification code has expired. Request a new one.' });
    const registration = pending.rows[0];
    await callVynfy('/otp/verify', { code, number: registration.phone });
    const details = setupDetails(registration);
    details.phone = registration.phone;
    const result = await createInitialAdmin(client, details, registration.password_hash);
    if (!result) return res.status(409).json({ error: 'KenadHR has already been set up. Contact your HR administrator for an account.' });
    await client.query('DELETE FROM hr_signup_otps WHERE id=$1', [signupId]);
    const token = jwt.sign({ id: result.user.id, role: result.user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ token, user: result.user, company: result.company });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('HR signup OTP verification error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not verify the code' });
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
              department_id, photo_url, phone, phone_verified_at, is_active
       FROM employees WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const employee = rows[0];
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });
    if (!employee.is_active) return res.status(403).json({ error: 'Account is deactivated' });
    if (employee.role === 'admin') return res.status(403).json({ error: 'Please use the HR/Admin sign in page for this account' });

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // A staff account is issued by HR, then the staff member confirms its phone
    // the first time they sign in. Existing accounts remain unusable until HR
    // records a valid Ghana phone number for them.
    if (otpEnabled() && !employee.phone_verified_at) {
      const phone = normalizeGhanaPhone(employee.phone);
      if (!phone) {
        return res.status(403).json({ error: 'Your account needs a valid Ghana phone number before first sign in. Please contact HR.' });
      }
      const recent = await db.query(
        "SELECT COUNT(*) FROM staff_login_otps WHERE employee_id=$1 AND created_at > NOW() - INTERVAL '15 minutes'",
        [employee.id]
      );
      if (Number(recent.rows[0].count) >= 3) {
        return res.status(429).json({ error: 'Too many verification requests. Please wait a few minutes.' });
      }
      await callVynfy('/otp/generate', {
        expiry: 5,
        length: 6,
        medium: 'sms',
        message: 'Your KenadHR staff sign-in code is %otp_code%. It expires in 5 minutes.',
        number: phone,
        otp_type: 'number',
        sender_id: process.env.VYNFY_SENDER_ID || 'KenadHR'
      });
      const verificationId = crypto.randomUUID();
      await db.query(
        `INSERT INTO staff_login_otps (id, employee_id, phone, expires_at)
         VALUES ($1,$2,$3,NOW() + INTERVAL '5 minutes')`,
        [verificationId, employee.id, phone]
      );
      return res.status(202).json({
        requires_otp: true,
        verification_id: verificationId,
        message: 'Verification code sent'
      });
    }

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

exports.verifyStaffLoginOtp = async (req, res) => {
  try {
    if (!otpEnabled()) return res.status(404).json({ error: 'Route not found' });
    const verificationId = String(req.body.verification_id || '').trim();
    const code = String(req.body.code || '').trim();
    if (!verificationId || !/^\d{4,8}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the verification code sent to your phone' });
    }
    const { rows } = await db.query(
      `SELECT o.id AS otp_id, o.phone, e.id, e.company_id, e.first_name, e.last_name,
              e.email, e.role, e.department_id, e.photo_url, e.is_active
       FROM staff_login_otps o
       JOIN employees e ON e.id = o.employee_id
       WHERE o.id=$1 AND o.expires_at > NOW()`,
      [verificationId]
    );
    const employee = rows[0];
    if (!employee) return res.status(400).json({ error: 'This verification code has expired. Sign in again to request a new one.' });
    if (!employee.is_active) return res.status(403).json({ error: 'Account is deactivated' });
    if (employee.role === 'admin') return res.status(403).json({ error: 'Please use the HR/Admin sign in page for this account' });

    await callVynfy('/otp/verify', { code, number: employee.phone });
    await db.query('UPDATE employees SET phone_verified_at=NOW() WHERE id=$1', [employee.id]);
    await db.query('DELETE FROM staff_login_otps WHERE id=$1', [employee.otp_id]);

    const token = jwt.sign({ id: employee.id, role: employee.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const { otp_id, is_active, ...userSafe } = employee;
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error('Staff login OTP verification error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Could not verify the code' });
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
