const db = require('../config/db');

exports.submitApplication = async (req, res) => {
  try {
    const { rows: companies } = await db.query('SELECT id FROM companies WHERE slug=$1', [req.params.slug]);
    if (!companies.length) return res.status(404).json({ error: 'This application link is not available' });
    const fullName = String(req.body.full_name || '').trim(), email = String(req.body.email || '').trim().toLowerCase();
    if (!fullName || !email || !req.files?.length) return res.status(400).json({ error: 'Name, email, and at least one document are required' });
    const { rows } = await db.query(`INSERT INTO candidate_applications (company_id,full_name,email,phone,role_applied,cover_note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [companies[0].id, fullName, email, String(req.body.phone || '').trim() || null, String(req.body.role_applied || '').trim() || null, String(req.body.cover_note || '').trim() || null]);
    for (const file of req.files) await db.query('INSERT INTO candidate_documents (application_id,document_type,original_name,mime_type,file_data) VALUES ($1,$2,$3,$4,$5)', [rows[0].id, file.fieldname, file.originalname, file.mimetype, file.buffer]);
    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not submit application' }); }
};
exports.getApplicationLink = async (req, res) => { try { const { rows } = await db.query('SELECT slug FROM companies WHERE id=$1', [req.user.company_id]); if (!rows.length) return res.status(404).json({ error: 'Company not found' }); res.json({ slug: rows[0].slug }); } catch { res.status(500).json({ error: 'Could not create application link' }); } };
exports.getApplications = async (req, res) => { try { const { rows } = await db.query(`SELECT a.*, COUNT(d.id)::int AS document_count FROM candidate_applications a LEFT JOIN candidate_documents d ON d.application_id=a.id WHERE a.company_id=$1 GROUP BY a.id ORDER BY a.submitted_at DESC`, [req.user.company_id]); res.json(rows); } catch { res.status(500).json({ error: 'Could not fetch applications' }); } };
exports.updateStatus = async (req, res) => { try { const status=String(req.body.status||''); if(!['submitted','reviewing','shortlisted','rejected'].includes(status)) return res.status(400).json({error:'Invalid status'}); const {rows}=await db.query('UPDATE candidate_applications SET status=$1 WHERE id=$2 AND company_id=$3 RETURNING *',[status,req.params.id,req.user.company_id]); if(!rows.length)return res.status(404).json({error:'Application not found'});res.json(rows[0]); } catch {res.status(500).json({error:'Could not update application'});} };
exports.downloadDocument = async (req,res)=>{try{const {rows}=await db.query(`SELECT d.* FROM candidate_documents d JOIN candidate_applications a ON a.id=d.application_id WHERE d.id=$1 AND a.id=$2 AND a.company_id=$3`,[req.params.documentId,req.params.id,req.user.company_id]);if(!rows.length)return res.status(404).json({error:'Document not found'});const d=rows[0];res.type(d.mime_type||'application/octet-stream');res.set('Content-Disposition',`attachment; filename="${d.original_name.replace(/["\\]/g,'_')}"`);res.send(d.file_data);}catch{res.status(500).json({error:'Could not download document'});}};
