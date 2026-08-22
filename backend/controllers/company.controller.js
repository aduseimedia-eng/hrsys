const db = require("../config/db");

const brandColumns = "logo_url, primary_color, accent_color, CASE WHEN logo_data IS NULL THEN NULL ELSE 'data:' || COALESCE(logo_mime_type,'image/png') || ';base64,' || encode(logo_data,'base64') END AS uploaded_logo";

const profileColumns = 'name, legal_name, email, phone, address, city, country, timezone, currency, work_week, locale, date_format, week_start, announcement_expiry_days, default_records_per_page, employee_code_prefix, currency_symbol, currency_symbol_position';

exports.getSettings = async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT ${profileColumns} FROM companies WHERE id=$1`, [req.user.company_id]);
    res.json(rows[0] || {});
  } catch { res.status(500).json({ error: 'Could not fetch company settings' }); }
};

exports.updateSettings = async (req, res) => {
  try {
    const value = (key, limit = 160) => String(req.body[key] || '').trim().slice(0, limit) || null;
    const timezone = value('timezone', 80) || 'UTC';
    const currency = (value('currency', 8) || 'USD').toUpperCase();
    const workWeek = value('work_week', 32) || 'Monday-Friday';
    const locale = value('locale', 35) || 'en-GB';
    const dateFormat = value('date_format', 24) || 'DD/MM/YYYY';
    const weekStart = value('week_start', 12) || 'Monday';
    const { rows } = await db.query(
      `UPDATE companies SET legal_name=$1, email=$2, phone=$3, address=$4, city=$5, country=$6, timezone=$7, currency=$8, work_week=$9, locale=$10, date_format=$11, week_start=$12, updated_at=NOW()
       WHERE id=$13 RETURNING ${profileColumns}`,
      [value('legal_name'), value('email'), value('phone', 40), value('address', 1000), value('city', 120), value('country', 120), timezone, currency, workWeek, locale, dateFormat, weekStart, req.user.company_id],
    );
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not save company settings' });
  }
};

exports.updateSystemPreferences = async (req, res) => {
  try {
    const expiryDays = Number(req.body.announcement_expiry_days);
    const recordsPerPage = Number(req.body.default_records_per_page);
    const employeeCodePrefix = String(req.body.employee_code_prefix || '').trim().toUpperCase();
    const currencySymbol = String(req.body.currency_symbol || '').trim();
    const currencySymbolPosition = String(req.body.currency_symbol_position || 'prefix').trim();

    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 3650) {
      return res.status(400).json({ error: 'Announcement expiry must be between 1 and 3650 days' });
    }
    if (!Number.isInteger(recordsPerPage) || recordsPerPage < 5 || recordsPerPage > 200) {
      return res.status(400).json({ error: 'Records per page must be between 5 and 200' });
    }
    if (employeeCodePrefix.length > 20 || !/^[A-Z0-9-]*$/.test(employeeCodePrefix)) {
      return res.status(400).json({ error: 'Employee ID prefix may contain only letters, numbers, and hyphens' });
    }
    if (currencySymbol.length > 8) {
      return res.status(400).json({ error: 'Currency symbol must be 8 characters or fewer' });
    }
    if (!['prefix', 'suffix'].includes(currencySymbolPosition)) {
      return res.status(400).json({ error: 'Currency symbol position must be prefix or suffix' });
    }

    const { rows } = await db.query(
      `UPDATE companies SET announcement_expiry_days=$1, default_records_per_page=$2, employee_code_prefix=$3,
       currency_symbol=$4, currency_symbol_position=$5, updated_at=NOW()
       WHERE id=$6 RETURNING ${profileColumns}`,
      [expiryDays, recordsPerPage, employeeCodePrefix, currencySymbol || null, currencySymbolPosition, req.user.company_id],
    );
    res.json(rows[0] || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not save system preferences' });
  }
};

exports.getBranding = async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT name, ${brandColumns} FROM companies WHERE id=$1`, [req.user.company_id]);
    res.json(rows[0] || {});
  } catch { res.status(500).json({ error: "Could not fetch company branding" }); }
};

exports.updateBranding = async (req, res) => {
  try {
    const { name, logo_url, primary_color, accent_color } = req.body;
    const companyName = String(name || '').trim();
    if (!companyName) return res.status(400).json({ error: 'Company name is required' });
    if (companyName.length > 160) return res.status(400).json({ error: 'Company name must be 160 characters or fewer' });
    const { rows } = await db.query(`UPDATE companies SET name=$1, logo_url=$2, primary_color=$3, accent_color=$4, logo_data=COALESCE($5,logo_data), logo_mime_type=COALESCE($6,logo_mime_type), updated_at=NOW() WHERE id=$7 RETURNING name, ${brandColumns}`,
      [companyName, String(logo_url || "").trim() || null, String(primary_color || "").trim() || null, String(accent_color || "").trim() || null, req.file?.buffer || null, req.file?.mimetype || null, req.user.company_id]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That company name is already in use' });
    console.error(error); res.status(500).json({ error: "Could not save company branding" });
  }
};
