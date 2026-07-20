// controllers/notifications.controller.js
const db = require('../config/db');

exports.getMine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE company_id=$1 AND employee_id=$2 ORDER BY created_at DESC LIMIT 50`,
      [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch notifications' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE company_id=$1 AND employee_id=$2 AND is_read=false',
      [req.user.company_id, req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch count' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      'UPDATE notifications SET is_read=true WHERE id=$1 AND company_id=$2 AND employee_id=$3',
      [id, req.user.company_id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update notification' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read=true WHERE company_id=$1 AND employee_id=$2',
      [req.user.company_id, req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update notifications' });
  }
};

// Admin: broadcast announcement
exports.announce = async (req, res) => {
  try {
    const { title, body, is_pinned } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    const { rows } = await db.query(
      'INSERT INTO announcements (company_id,created_by,title,body,is_pinned) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.company_id, req.user.id, title, body, is_pinned || false]
    );

    const { rows: emps } = await db.query(
      'SELECT id FROM employees WHERE company_id=$1 AND is_active=true',
      [req.user.company_id]
    );
    for (const emp of emps) {
      await db.query(
        "INSERT INTO notifications (company_id,employee_id,type,message,link) VALUES ($1,$2,'announcement',$3,'/pages/staff-portal.html#announcements')",
        [req.user.company_id, emp.id, `Announcement: ${title}`]
      );
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not send announcement' });
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS author_name, e.photo_url
       FROM announcements a
       JOIN employees e ON e.id = a.created_by
       WHERE a.company_id=$1
       ORDER BY a.is_pinned DESC, a.created_at DESC
       LIMIT 20`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch announcements' });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const { title, body, is_pinned } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
    const { rows } = await db.query(
      `UPDATE announcements
       SET title=$1, body=$2, is_pinned=$3
       WHERE id=$4 AND company_id=$5
       RETURNING *`,
      [title, body, !!is_pinned, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Announcement not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update announcement' });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM announcements WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete announcement' });
  }
};
