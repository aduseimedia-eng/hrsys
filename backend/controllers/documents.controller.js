// controllers/documents.controller.js
const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');

exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { doc_type, shared_with } = req.body;
    const title = String(req.body.title || req.file.originalname).trim();
    const employeeId = req.body.employee_id || req.user.id;
    const shareWithHr = req.body.share_with_hr !== 'false';

    if (!title) return res.status(400).json({ error: 'Document title is required' });
    if (title.length > 200) return res.status(400).json({ error: 'Document title must be 200 characters or fewer' });

    // Only admins can upload for others
    if (parseInt(employeeId) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileData = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    const { rows } = await db.query(
      `INSERT INTO documents (company_id, employee_id, doc_type, title, file_path, original_name, file_size, mime_type, file_data, share_with_hr, shared_with)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, employeeId, doc_type || 'other',
       title, `/uploads/documents/${req.file.filename}`,
       req.file.originalname, req.file.size, req.file.mimetype || null, fileData, shareWithHr, shared_with || null]
    );
    if (req.file.path) fs.unlink(req.file.path, () => {});
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not save document' });
  }
};

exports.getMine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              CONCAT(s.first_name,' ',s.last_name) AS shared_with_name
       FROM documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       LEFT JOIN employees s ON s.id = d.shared_with
       WHERE d.company_id=$1
         AND (d.employee_id=$2 OR d.shared_with=$2 OR (d.share_with_hr=true AND $3 IN ('admin','manager')))
       ORDER BY d.uploaded_at DESC`,
      [req.user.company_id, req.user.id, req.user.role]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch documents' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              CONCAT(s.first_name,' ',s.last_name) AS shared_with_name
       FROM documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       LEFT JOIN employees s ON s.id = d.shared_with
       WHERE d.company_id=$1
       ORDER BY d.uploaded_at DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch documents' });
  }
};

exports.getForEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'employee' && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await db.query(
      'SELECT * FROM documents WHERE company_id=$1 AND employee_id=$2 ORDER BY uploaded_at DESC', [req.user.company_id, id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch documents' });
  }
};

async function getAccessibleDocument(req, res) {
  const { rows } = await db.query(
    'SELECT * FROM documents WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.company_id]
  );
  if (!rows.length) {
    res.status(404).json({ error: 'Document not found' });
    return null;
  }
  const doc = rows[0];
  const canAccess = ['admin', 'manager'].includes(req.user.role)
    || doc.employee_id === req.user.id
    || doc.shared_with === req.user.id;
  if (!canAccess) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return doc;
}

function sendDocument(res, doc, { download = false } = {}) {
  if (doc.file_data) {
    res.type(doc.mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${String(doc.original_name || 'document').replace(/[\"\\]/g, '_')}"`);
    return res.send(doc.file_data);
  }
  const filePath = path.join(__dirname, '..', doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Document file not found. Please ask the owner to upload it again.' });
  return download ? res.download(filePath, doc.original_name) : res.sendFile(filePath);
}

exports.view = async (req, res) => {
  try {
    const doc = await getAccessibleDocument(req, res);
    if (!doc) return;
    return sendDocument(res, doc);
  } catch (err) {
    res.status(500).json({ error: 'Could not open document' });
  }
};

exports.download = async (req, res) => {
  try {
    const doc = await getAccessibleDocument(req, res);
    if (!doc) return;
    return sendDocument(res, doc, { download: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not download document' });
  }
};

exports.deleteDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM documents WHERE id=$1 AND company_id=$2', [id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = rows[0];
    if (req.user.role !== 'admin' && doc.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '..', doc.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query('DELETE FROM documents WHERE id=$1', [id]);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete document' });
  }
};
