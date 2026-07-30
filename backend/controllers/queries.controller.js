const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');

async function isQueryOfficer(user) {
  if (user.role === 'admin') return true;
  const { rows } = await db.query('SELECT job_title FROM employees WHERE id=$1 AND company_id=$2', [user.id, user.company_id]);
  return /\b(hr|human resources|admin(?:istration)? officer)\b/i.test(rows[0]?.job_title || '');
}
const baseSelect = `SELECT q.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.job_title, CONCAT(r.first_name,' ',r.last_name) AS responder_name FROM employee_queries q JOIN employees e ON e.id=q.employee_id LEFT JOIN employees r ON r.id=q.responded_by`;

exports.access = async (req, res) => { try { res.json({ can_manage: await isQueryOfficer(req.user) }); } catch { res.status(500).json({ error: 'Could not check query access' }); } };
exports.create = async (req, res) => {
  try {
    const subject = String(req.body.subject || '').trim(), description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'general').trim();
    if (!subject || !description) return res.status(400).json({ error: 'Subject and query details are required' });
    if (subject.length > 180) return res.status(400).json({ error: 'Subject must be 180 characters or fewer' });
    const { rows } = await db.query(`INSERT INTO employee_queries (company_id,employee_id,category,subject,description) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.user.company_id, req.user.id, category, subject, description]);
    const { rows: officers } = await db.query(`SELECT id FROM employees WHERE company_id=$1 AND is_active=true AND (role='admin' OR job_title ~* '\\m(hr|human resources|admin(istration)? officer)\\M')`, [req.user.company_id]);
    await Promise.all(officers.filter(o => o.id !== req.user.id).map(o => notifyEmployee({ companyId:req.user.company_id, employeeId:o.id, type:'employee_query', message:`New employee query: ${subject}`, link:'/pages/performance.html#queries' })));
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not submit query' }); }
};
exports.mine = async (req, res) => { try { const { rows } = await db.query(`${baseSelect} WHERE q.company_id=$1 AND q.employee_id=$2 ORDER BY q.created_at DESC`, [req.user.company_id, req.user.id]); res.json(rows); } catch { res.status(500).json({ error: 'Could not fetch your queries' }); } };
exports.queue = async (req, res) => { try { if (!await isQueryOfficer(req.user)) return res.status(403).json({ error: 'Only HR and Admin Officers can view employee queries' }); const params=[req.user.company_id]; let where='WHERE q.company_id=$1'; if(req.query.status){params.push(req.query.status);where+=` AND q.status=$${params.length}`;} const {rows}=await db.query(`${baseSelect} ${where} ORDER BY CASE q.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, q.created_at DESC`,params);res.json(rows); } catch {res.status(500).json({error:'Could not fetch employee queries'});} };
exports.update = async (req, res) => { try { if (!await isQueryOfficer(req.user)) return res.status(403).json({ error: 'Only HR and Admin Officers can respond to queries' }); const status=String(req.body.status||'');if(!['open','in_progress','resolved','closed'].includes(status))return res.status(400).json({error:'Invalid status'});const response=String(req.body.response||'').trim();const {rows}=await db.query(`UPDATE employee_queries SET status=$1,response=$2,responded_by=$3,responded_at=CASE WHEN $2<>'' THEN NOW() ELSE responded_at END,updated_at=NOW() WHERE id=$4 AND company_id=$5 RETURNING *`,[status,response,req.user.id,req.params.id,req.user.company_id]);if(!rows.length)return res.status(404).json({error:'Query not found'});if(response||['resolved','closed'].includes(status))await notifyEmployee({companyId:req.user.company_id,employeeId:rows[0].employee_id,type:'employee_query',message:`Your HR query "${rows[0].subject}" has been updated.`,link:'/pages/performance.html#queries'});res.json(rows[0]); }catch(err){console.error(err);res.status(500).json({error:'Could not update query'});} };
