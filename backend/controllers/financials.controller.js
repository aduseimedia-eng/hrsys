const db = require('../config/db');

const categories = ['cash_income', 'petty_cash', 'office_expense', 'rent', 'utilities', 'internet_telephone', 'vehicle_fuel', 'vehicle_maintenance', 'office_maintenance', 'payroll_adjustment', 'tax', 'other'];
const statuses = ['draft', 'pending', 'paid', 'void'];
const paymentMethods = ['cash', 'bank', 'mobile_money', 'other'];
const transactionProjection = `id, company_id, transaction_type, category,
  transaction_date, title, payee_or_source, reference_no, amount,
  payment_method, due_date, status, notes, receipt_name, receipt_mime_type,
  receipt_size, created_by, updated_by, created_at, updated_at`;

function transactionValues(body) {
  return [body.transaction_type, body.category, body.transaction_date, String(body.title || '').trim(),
    String(body.payee_or_source || '').trim() || null, String(body.reference_no || '').trim() || null,
    Number(body.amount), body.payment_method || 'bank', body.due_date || null, body.status || 'paid', String(body.notes || '').trim() || null];
}
function validate(body) {
  const values = transactionValues(body);
  if (!['income', 'expense'].includes(values[0])) return 'Choose income or expense';
  if (!categories.includes(values[1])) return 'Choose a valid finance category';
  if (!values[2] || !values[3]) return 'Date and description are required';
  if (body.amount === '' || body.amount == null || !Number.isFinite(values[6]) || values[6] < 0) return 'Enter a valid non-negative amount';
  if (!paymentMethods.includes(values[7])) return 'Choose a valid payment method';
  if (!statuses.includes(values[9])) return 'Choose a valid status';
  return null;
}

exports.getSummary = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: 'Provide a valid month and year' });
    const companyId = req.user.company_id;
    const [payroll, totals, cashTotals, bills, recent] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(base_salary + allowances + overtime_pay + ssnit_employer), 0) AS total, COUNT(*) FILTER (WHERE status='paid') AS paid_count, COUNT(*) AS record_count FROM payroll WHERE company_id=$1 AND year=$2 AND month=$3`, [companyId, year, month]),
      db.query(`SELECT transaction_type, category, COALESCE(SUM(amount), 0) AS total FROM financial_transactions WHERE company_id=$1 AND status='paid' AND EXTRACT(YEAR FROM transaction_date)=$2 AND EXTRACT(MONTH FROM transaction_date)=$3 GROUP BY transaction_type, category`, [companyId, year, month]),
      db.query(`SELECT transaction_type, COALESCE(SUM(amount), 0) AS total FROM financial_transactions WHERE company_id=$1 AND payment_method='cash' AND status='paid' GROUP BY transaction_type`, [companyId]),
      db.query(`SELECT ${transactionProjection} FROM financial_transactions WHERE company_id=$1 AND transaction_type='expense' AND status IN ('draft','pending') AND due_date IS NOT NULL ORDER BY due_date ASC LIMIT 8`, [companyId]),
      db.query(`SELECT ${transactionProjection} FROM financial_transactions WHERE company_id=$1 AND EXTRACT(YEAR FROM transaction_date)=$2 AND EXTRACT(MONTH FROM transaction_date)=$3 ORDER BY transaction_date DESC, created_at DESC LIMIT 20`, [companyId, year, month])
    ]);
    const byCategory = {}, total = { income: 0, expense: 0 };
    totals.rows.forEach(row => { const amount = Number(row.total); total[row.transaction_type] += amount; if (row.transaction_type === 'expense') byCategory[row.category] = amount; });
    const cash = { income: 0, expense: 0 };
    cashTotals.rows.forEach(row => { cash[row.transaction_type] = Number(row.total); });
    res.json({ period: { year, month }, payroll: { total: Number(payroll.rows[0].total), paid_count: Number(payroll.rows[0].paid_count), record_count: Number(payroll.rows[0].record_count) }, transactions: { ...total, by_category: byCategory }, cash: { ...cash, balance: cash.income - cash.expense }, outstanding_bills: bills.rows, recent_transactions: recent.rows });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not fetch financial summary' }); }
};

exports.listTransactions = async (req, res) => {
  try {
    const { year, month, type } = req.query; const params = [req.user.company_id]; let where = 'WHERE company_id=$1';
    if (year) { params.push(year); where += ` AND EXTRACT(YEAR FROM transaction_date)=$${params.length}`; }
    if (month) { params.push(month); where += ` AND EXTRACT(MONTH FROM transaction_date)=$${params.length}`; }
    if (type) { params.push(type); where += ` AND transaction_type=$${params.length}`; }
    const { rows } = await db.query(`SELECT ${transactionProjection} FROM financial_transactions ${where} ORDER BY transaction_date DESC, created_at DESC`, params); res.json(rows);
  } catch { res.status(500).json({ error: 'Could not fetch transactions' }); }
};
exports.createTransaction = async (req, res) => {
  try { const error = validate(req.body); if (error) return res.status(400).json({ error }); const { rows } = await db.query(`INSERT INTO financial_transactions(company_id,transaction_type,category,transaction_date,title,payee_or_source,reference_no,amount,payment_method,due_date,status,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING ${transactionProjection}`, [req.user.company_id, ...transactionValues(req.body), req.user.id]); res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not save transaction' }); }
};
exports.updateTransaction = async (req, res) => {
  try { const error = validate(req.body); if (error) return res.status(400).json({ error }); const { rows } = await db.query(`UPDATE financial_transactions SET transaction_type=$1,category=$2,transaction_date=$3,title=$4,payee_or_source=$5,reference_no=$6,amount=$7,payment_method=$8,due_date=$9,status=$10,notes=$11,updated_by=$12,updated_at=NOW() WHERE id=$13 AND company_id=$14 RETURNING ${transactionProjection}`, [...transactionValues(req.body), req.user.id, req.params.id, req.user.company_id]); if (!rows.length) return res.status(404).json({ error: 'Transaction not found' }); res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not update transaction' }); }
};

exports.settleTransaction = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE financial_transactions
       SET status='paid', updated_by=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND transaction_type='expense' AND status IN ('draft', 'pending')
       RETURNING id, title, status`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pending bill not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not settle bill' });
  }
};

exports.uploadReceipt = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a receipt image or PDF to upload' });
    const { rows } = await db.query(
      `UPDATE financial_transactions
       SET receipt_name=$1, receipt_mime_type=$2, receipt_size=$3, receipt_data=$4, updated_by=$5, updated_at=NOW()
       WHERE id=$6 AND company_id=$7 RETURNING id, receipt_name, receipt_mime_type, receipt_size`,
      [req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not upload receipt' });
  }
};

exports.viewReceipt = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT receipt_name, receipt_mime_type, receipt_data FROM financial_transactions WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (!rows.length || !rows[0].receipt_data) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = rows[0];
    res.type(receipt.receipt_mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${String(receipt.receipt_name || 'receipt').replace(/["\\]/g, '_')}"`);
    res.send(receipt.receipt_data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not open receipt' });
  }
};
