const db = require('../config/db');

const CATEGORIES = ['event', 'meeting', 'payday', 'shutdown', 'holiday'];

exports.list = async (req, res) => {
  try {
    const from = String(req.query.from || `${new Date().getFullYear()}-01-01`);
    const to = String(req.query.to || `${new Date().getFullYear()}-12-31`);
    const { rows } = await db.query(
      `SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM company_calendar_events e JOIN employees u ON u.id=e.created_by
       WHERE e.company_id=$1 AND e.start_date <= $3::date AND e.end_date >= $2::date
       ORDER BY e.start_date, e.title`, [req.user.company_id, from, to]
    );
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Could not load company calendar' }); }
};

exports.create = async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const startDate = String(req.body.start_date || '');
    const endDate = String(req.body.end_date || startDate);
    const category = String(req.body.category || 'event');
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return res.status(400).json({ error: 'Title and valid event dates are required' });
    if (endDate < startDate) return res.status(400).json({ error: 'End date cannot be before start date' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose a valid event category' });
    const { rows } = await db.query(
      `INSERT INTO company_calendar_events (company_id,title,description,category,start_date,end_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, title, String(req.body.description || '').trim() || null, category, startDate, endDate, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (error) { res.status(500).json({ error: 'Could not create company event' }); }
};

exports.remove = async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM company_calendar_events WHERE id=$1 AND company_id=$2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Company event not found' });
    res.json(rows[0]);
  } catch (error) { res.status(500).json({ error: 'Could not delete company event' }); }
};
