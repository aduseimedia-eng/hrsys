const db = require('../config/db');

const CATEGORIES = ['health_insurance', 'life_insurance', 'retirement', 'wellness', 'transport', 'meal', 'leave', 'education', 'other'];

function payload(body) {
  const name = String(body.name || '').trim();
  const category = String(body.category || 'other').trim();
  const employeeCost = Number(body.employee_cost || 0);
  const employerCost = Number(body.employer_cost || 0);
  if (!name || name.length > 160) return { error: 'Benefit name is required and must be 160 characters or fewer' };
  if (!CATEGORIES.includes(category)) return { error: 'Select a valid benefit category' };
  if (![employeeCost, employerCost].every((value) => Number.isFinite(value) && value >= 0)) return { error: 'Benefit costs must be valid non-negative amounts' };
  return {
    name, category, employeeCost, employerCost,
    provider: String(body.provider || '').trim() || null,
    description: String(body.description || '').trim() || null,
    eligibility: String(body.eligibility || '').trim() || null,
    enrollmentInfo: String(body.enrollment_info || '').trim() || null,
    isActive: body.is_active !== false && body.is_active !== 'false'
  };
}

exports.getAll = async (req, res) => {
  try {
    const includeInactive = ['admin', 'manager'].includes(req.user.role) && req.query.include_inactive === 'true';
    const { rows } = await db.query(
      `SELECT * FROM benefits WHERE company_id=$1 ${includeInactive ? '' : 'AND is_active=true'} ORDER BY is_active DESC, category, name`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Could not fetch benefits' }); }
};

exports.create = async (req, res) => {
  try {
    const item = payload(req.body);
    if (item.error) return res.status(400).json({ error: item.error });
    const { rows } = await db.query(
      `INSERT INTO benefits (company_id,name,category,provider,description,eligibility,employee_cost,employer_cost,enrollment_info,is_active,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, item.name, item.category, item.provider, item.description, item.eligibility, item.employeeCost, item.employerCost, item.enrollmentInfo, item.isActive, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not create benefit' }); }
};

exports.update = async (req, res) => {
  try {
    const item = payload(req.body);
    if (item.error) return res.status(400).json({ error: item.error });
    const { rows } = await db.query(
      `UPDATE benefits SET name=$1,category=$2,provider=$3,description=$4,eligibility=$5,employee_cost=$6,employer_cost=$7,enrollment_info=$8,is_active=$9,updated_at=NOW()
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [item.name, item.category, item.provider, item.description, item.eligibility, item.employeeCost, item.employerCost, item.enrollmentInfo, item.isActive, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Benefit not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not update benefit' }); }
};

exports.remove = async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM benefits WHERE id=$1 AND company_id=$2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Benefit not found' });
    res.json({ message: 'Benefit deleted' });
  } catch { res.status(500).json({ error: 'Could not delete benefit' }); }
};
