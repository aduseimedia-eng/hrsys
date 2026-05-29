// controllers/messages.controller.js
const db = require('../config/db');

// ─── Send a message ───────────────────────────────────────────
exports.send = async (req, res) => {
  try {
    const { receiver_id, body } = req.body;
    if (!receiver_id || !body?.trim()) {
      return res.status(400).json({ error: 'Receiver and message body required' });
    }
    if (parseInt(receiver_id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    const receiverCheck = await db.query('SELECT id FROM employees WHERE id=$1 AND is_active=true', [receiver_id]);
    if (!receiverCheck.rows.length) return res.status(404).json({ error: 'Recipient not found' });

    const { rows } = await db.query(
      'INSERT INTO messages (sender_id,receiver_id,body) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, receiver_id, body.trim()]
    );

    // Notify receiver
    const senderName = `${req.user.first_name} ${req.user.last_name}`;
    await db.query(
      "INSERT INTO notifications (employee_id,type,message,link) VALUES ($1,'message',$2,'/messages')",
      [receiver_id, `New message from ${senderName}`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not send message' });
  }
};

// ─── Get conversation with a specific person ──────────────────
exports.getConversation = async (req, res) => {
  try {
    const { id } = req.params; // the other person's ID
    const { rows } = await db.query(
      `SELECT m.*, 
              CONCAT(s.first_name,' ',s.last_name) AS sender_name, s.photo_url AS sender_photo
       FROM messages m
       JOIN employees s ON s.id = m.sender_id
       WHERE (m.sender_id=$1 AND m.receiver_id=$2)
          OR (m.sender_id=$2 AND m.receiver_id=$1)
       ORDER BY m.sent_at ASC`,
      [req.user.id, id]
    );

    // Mark messages from other person as read
    await db.query(
      'UPDATE messages SET is_read=true WHERE sender_id=$1 AND receiver_id=$2 AND is_read=false',
      [id, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch conversation' });
  }
};

// ─── Get all conversations (inbox overview) ───────────────────
exports.getInbox = async (req, res) => {
  try {
    // Get distinct people the current user has chatted with, with latest message
    const { rows } = await db.query(
      `WITH partners AS (
         SELECT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END AS partner_id,
                MAX(sent_at) AS last_msg_time
         FROM messages
         WHERE sender_id=$1 OR receiver_id=$1
         GROUP BY partner_id
       )
       SELECT e.id, e.first_name, e.last_name, e.photo_url, e.job_title,
              p.last_msg_time,
              (SELECT body FROM messages
               WHERE (sender_id=$1 AND receiver_id=e.id) OR (sender_id=e.id AND receiver_id=$1)
               ORDER BY sent_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages
               WHERE sender_id=e.id AND receiver_id=$1 AND is_read=false) AS unread_count
       FROM partners p
       JOIN employees e ON e.id = p.partner_id
       ORDER BY p.last_msg_time DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch inbox' });
  }
};

// ─── Unread message count ─────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM messages WHERE receiver_id=$1 AND is_read=false',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch count' });
  }
};
