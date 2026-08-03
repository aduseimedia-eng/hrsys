const db = require('../config/db');
const statuses = ['available', 'assigned', 'maintenance', 'retired', 'lost'];
const conditions = ['new', 'good', 'fair', 'poor'];

function values(body) {
  const cost = body.purchase_cost === '' || body.purchase_cost === undefined || body.purchase_cost === null ? null : Number(body.purchase_cost);
  const assignedTo = body.assigned_to === '' || body.assigned_to === undefined || body.assigned_to === null ? null : Number(body.assigned_to);
  const status = String(body.status || 'available');
  return [String(body.asset_code || '').trim(), String(body.name || '').trim(), String(body.category || 'other').trim(), String(body.serial_number || '').trim() || null,
    status, String(body.condition || 'good'), status === 'assigned' ? assignedTo : null, status === 'assigned' ? (body.assigned_at || null) : null, body.purchase_date || null,
    Number.isFinite(cost) ? cost : null, String(body.notes || '').trim() || null];
}
function validate(body) {
  const data = values(body);
  if (!data[0] || !data[1]) return 'Asset ID and asset name are required';
  if (!statuses.includes(data[4]) || !conditions.includes(data[5])) return 'Invalid asset status or condition';
  if (body.purchase_cost !== '' && body.purchase_cost !== undefined && body.purchase_cost !== null && !Number.isFinite(Number(body.purchase_cost))) return 'Purchase cost must be a number';
  if (data[4] === 'assigned' && !data[6]) return 'Choose the employee this asset is assigned to';
  return null;
}
async function validateAssignee(companyId, body) {
  const assignedTo = values(body)[6];
  if (!assignedTo) return null;
  const { rows } = await db.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND is_active=true', [assignedTo, companyId]);
  return rows.length ? null : 'Assigned employee was not found';
}
exports.list = async (req, res) => { try { const { rows } = await db.query(`SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.employee_code FROM company_assets a LEFT JOIN employees e ON e.id=a.assigned_to WHERE a.company_id=$1 ORDER BY a.name`, [req.user.company_id]); res.json(rows); } catch { res.status(500).json({ error: 'Could not fetch assets' }); } };
exports.create = async (req, res) => { try { const error = validate(req.body) || await validateAssignee(req.user.company_id, req.body); if (error) return res.status(400).json({ error }); const { rows } = await db.query(`INSERT INTO company_assets(company_id,asset_code,name,category,serial_number,status,condition,assigned_to,assigned_at,purchase_date,purchase_cost,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [req.user.company_id, ...values(req.body), req.user.id]); res.status(201).json(rows[0]); } catch (err) { res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'That asset ID is already in use' : 'Could not save asset' }); } };
exports.update = async (req, res) => { try { const error = validate(req.body) || await validateAssignee(req.user.company_id, req.body); if (error) return res.status(400).json({ error }); const { rows } = await db.query(`UPDATE company_assets SET asset_code=$1,name=$2,category=$3,serial_number=$4,status=$5,condition=$6,assigned_to=$7,assigned_at=$8,purchase_date=$9,purchase_cost=$10,notes=$11,updated_at=NOW() WHERE id=$12 AND company_id=$13 RETURNING *`, [...values(req.body), req.params.id, req.user.company_id]); if (!rows.length) return res.status(404).json({ error: 'Asset not found' }); res.json(rows[0]); } catch (err) { res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'That asset ID is already in use' : 'Could not update asset' }); } };
