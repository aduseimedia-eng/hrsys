const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, CONCAT(e.first_name, ' ', e.last_name) AS actor_name
       FROM audit_logs a LEFT JOIN employees e ON e.id=a.actor_id
       WHERE a.company_id=$1 ORDER BY a.created_at DESC LIMIT 200`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch audit history' });
  }
};
