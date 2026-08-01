const db = require('../config/db');

const expenseTypes = ['petty_cash', 'office_expense', 'vehicle_fuel', 'vehicle_maintenance', 'office_maintenance'];
const billTypes = ['quarterly_rent', 'ecg_bill', 'ghana_water_bill', 'internet_telephone'];

exports.getSummary = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Provide a valid month and year' });
    }

    const companyId = req.user.company_id;
    const [payroll, expenses, bills, recent] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(base_salary + allowances + overtime_pay + ssnit_employer), 0) AS total,
                       COUNT(*) FILTER (WHERE status='paid') AS paid_count,
                       COUNT(*) AS record_count
                FROM payroll
                WHERE company_id=$1 AND year=$2 AND month=$3`, [companyId, year, month]),
      db.query(`SELECT register_type, COALESCE(SUM(amount), 0) AS total
                FROM operations_register_entries
                WHERE company_id=$1 AND register_type = ANY($2)
                  AND EXTRACT(YEAR FROM entry_date)=$3 AND EXTRACT(MONTH FROM entry_date)=$4
                GROUP BY register_type`, [companyId, expenseTypes, year, month]),
      db.query(`SELECT id, register_type, title, contact_name, amount, due_date, status
                FROM operations_register_entries
                WHERE company_id=$1 AND register_type = ANY($2) AND status NOT IN ('paid', 'closed')
                  AND due_date IS NOT NULL
                ORDER BY due_date ASC LIMIT 8`, [companyId, billTypes]),
      db.query(`SELECT id, register_type, entry_date, title, contact_name, reference_no, amount, status
                FROM operations_register_entries
                WHERE company_id=$1 AND register_type = ANY($2)
                ORDER BY entry_date DESC, created_at DESC LIMIT 10`, [companyId, expenseTypes])
    ]);

    const expenseByType = Object.fromEntries(expenses.rows.map(row => [row.register_type, Number(row.total)]));
    const expenseTotal = Object.values(expenseByType).reduce((sum, value) => sum + value, 0);
    res.json({
      period: { year, month },
      payroll: { total: Number(payroll.rows[0].total), paid_count: Number(payroll.rows[0].paid_count), record_count: Number(payroll.rows[0].record_count) },
      expenses: { total: expenseTotal, by_type: expenseByType },
      outstanding_bills: bills.rows,
      recent_expenses: recent.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not fetch financial summary' });
  }
};
