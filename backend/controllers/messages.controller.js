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

    const receiverCheck = await db.query(
      'SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND is_active=true',
      [receiver_id, req.user.company_id]
    );
    if (!receiverCheck.rows.length) return res.status(404).json({ error: 'Recipient not found' });

    const { rows } = await db.query(
      'INSERT INTO messages (company_id,sender_id,receiver_id,body) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.company_id, req.user.id, receiver_id, body.trim()]
    );

    // Notify receiver
    const senderName = `${req.user.first_name} ${req.user.last_name}`;
    await db.query(
      "INSERT INTO notifications (company_id,employee_id,type,message,link) VALUES ($1,$2,'message',$3,'/pages/messages.html')",
      [req.user.company_id, receiver_id, `New message from ${senderName}`]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not send message' });
  }
};

// ─── Team chat ────────────────────────────────────────────────
exports.sendTeam = async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message body required' });
    const { rows } = await db.query(
      'INSERT INTO team_messages (company_id,sender_id,body) VALUES ($1,$2,$3) RETURNING *',
      [req.user.company_id, req.user.id, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not send team message' });
  }
};

exports.getTeam = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT tm.*, CONCAT(e.first_name,' ',e.last_name) AS sender_name, e.photo_url AS sender_photo
       FROM team_messages tm
       JOIN employees e ON e.id = tm.sender_id
       WHERE tm.company_id=$1
       ORDER BY tm.sent_at ASC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch team messages' });
  }
};

const editedBody = (body) => String(body || '').trim();

exports.update = async (req, res) => {
  try {
    const body = editedBody(req.body.body);
    if (!body) return res.status(400).json({ error: 'Message body required' });
    const { rows } = await db.query(
      'UPDATE messages SET body=$1, edited_at=NOW() WHERE id=$2 AND company_id=$3 AND sender_id=$4 RETURNING *',
      [body, req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sent message not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update message' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM messages WHERE id=$1 AND company_id=$2 AND sender_id=$3 RETURNING id',
      [req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sent message not found' });
    res.json({ message: 'Message deleted', id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete message' });
  }
};

exports.updateTeam = async (req, res) => {
  try {
    const body = editedBody(req.body.body);
    if (!body) return res.status(400).json({ error: 'Message body required' });
    const { rows } = await db.query(
      'UPDATE team_messages SET body=$1, edited_at=NOW() WHERE id=$2 AND company_id=$3 AND sender_id=$4 RETURNING *',
      [body, req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sent team message not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update team message' });
  }
};

exports.removeTeam = async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM team_messages WHERE id=$1 AND company_id=$2 AND sender_id=$3 RETURNING id',
      [req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sent team message not found' });
    res.json({ message: 'Team message deleted', id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete team message' });
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
       WHERE m.company_id=$3
         AND ((m.sender_id=$1 AND m.receiver_id=$2)
          OR (m.sender_id=$2 AND m.receiver_id=$1))
       ORDER BY m.sent_at ASC`,
      [req.user.id, id, req.user.company_id]
    );

    // Mark messages from other person as read
    await db.query(
      'UPDATE messages SET is_read=true WHERE company_id=$1 AND sender_id=$2 AND receiver_id=$3 AND is_read=false',
      [req.user.company_id, id, req.user.id]
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
         WHERE company_id=$2 AND (sender_id=$1 OR receiver_id=$1)
         GROUP BY partner_id
       )
       SELECT e.id, e.first_name, e.last_name, e.photo_url, e.job_title,
              p.last_msg_time,
              (SELECT body FROM messages
               WHERE company_id=$2 AND ((sender_id=$1 AND receiver_id=e.id) OR (sender_id=e.id AND receiver_id=$1))
               ORDER BY sent_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages
               WHERE company_id=$2 AND sender_id=e.id AND receiver_id=$1 AND is_read=false) AS unread_count
       FROM partners p
       JOIN employees e ON e.id = p.partner_id
       ORDER BY p.last_msg_time DESC`,
      [req.user.id, req.user.company_id]
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
      'SELECT COUNT(*) FROM messages WHERE company_id=$1 AND receiver_id=$2 AND is_read=false',
      [req.user.company_id, req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch count' });
  }
};
