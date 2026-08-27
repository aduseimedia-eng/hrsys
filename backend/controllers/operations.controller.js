const db = require('../config/db');

const registerTypes = ['resignation_exit'];
const statuses = ['pending', 'completed', 'closed'];
const select = `SELECT o.*, CONCAT(e.first_name, ' ', e.last_name) AS created_by_name
  FROM operations_register_entries o LEFT JOIN employees e ON e.id=o.created_by`;

function values(body) {
  const amount = body.amount === '' || body.amount === null || body.amount === undefined ? null : Number(body.amount);
  return [body.entry_date, String(body.title || '').trim(), String(body.contact_name || '').trim() || null,
    String(body.reference_no || '').trim() || null, Number.isFinite(amount) ? amount : null,
    body.due_date || null, String(body.status || 'open'), String(body.notes || '').trim() || null];
}
function validate(body) {
  if (!registerTypes.includes(String(body.register_type || ''))) return 'Invalid register type';
  const [entryDate, title,,,,, status] = values(body);
  if (!entryDate || !title) return 'Record date and details are required';
  if (!statuses.includes(status)) return 'Invalid record status';
  if (body.amount !== '' && body.amount !== null && body.amount !== undefined && !Number.isFinite(Number(body.amount))) return 'Amount must be a number';
  return null;
}

exports.types = (req, res) => res.json({ register_types: registerTypes, statuses });
exports.list = async (req, res) => {
  try {
    const type = String(req.query.type || '');
    if (type && !registerTypes.includes(type)) return res.status(400).json({ error: 'Invalid register type' });
    const params = [req.user.company_id];
    let where = 'WHERE o.company_id=$1';
    if (type) { params.push(type); where += ` AND o.register_type=$${params.length}`; }
    const { rows } = await db.query(`${select} ${where} ORDER BY o.entry_date DESC, o.created_at DESC`, params);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Could not fetch register entries' }); }
};
exports.create = async (req, res) => {
  try {
    const error = validate(req.body); if (error) return res.status(400).json({ error });
    const { rows } = await db.query(`INSERT INTO operations_register_entries(company_id,register_type,entry_date,title,contact_name,reference_no,amount,due_date,status,notes,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [req.user.company_id, req.body.register_type, ...values(req.body), req.user.id]);
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not add register entry' }); }
};
exports.update = async (req, res) => {
  try {
    const error = validate(req.body); if (error) return res.status(400).json({ error });
    const { rows } = await db.query(`UPDATE operations_register_entries SET entry_date=$1,title=$2,contact_name=$3,reference_no=$4,amount=$5,due_date=$6,status=$7,notes=$8,updated_at=NOW()
      WHERE id=$9 AND company_id=$10 AND register_type=$11 RETURNING *`, [...values(req.body), req.params.id, req.user.company_id, req.body.register_type]);
    if (!rows.length) return res.status(404).json({ error: 'Register entry not found' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not update register entry' }); }
};
