// controllers/documents.controller.js
const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');

exports.upload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { doc_type, shared_with } = req.body;
    const employeeId = req.body.employee_id || req.user.id;
    const shareWithHr = req.body.share_with_hr !== 'false';

    // Only admins can upload for others
    if (parseInt(employeeId) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rows } = await db.query(
      `INSERT INTO documents (company_id, employee_id, doc_type, file_path, original_name, file_size, share_with_hr, shared_with)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, employeeId, doc_type || 'other',
       `/uploads/documents/${req.file.filename}`,
       req.file.originalname, req.file.size, shareWithHr, shared_with || null]
    );
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
