const db = require('../config/db');
const { calculateMonthlyPayroll, calculatePaye } = require('../config/ghana-payroll');

const number = value => Number(value || 0);
const validMoney = value => Number.isFinite(number(value)) && number(value) >= 0;
const calculation = ({ basic_salary, allowances, other_deductions, ssnit_insurable_salary }) => {
  const basic = number(basic_salary), allowance = number(allowances), other = number(other_deductions);
  const result = calculateMonthlyPayroll({ basicSalary: ssnit_insurable_salary == null ? basic : number(ssnit_insurable_salary), allowances: allowance, otherDeductions: other });
  const payeTax = calculatePaye(basic + allowance - result.ssnitEmployee);
  return { basic, allowance, other, insurable: number(ssnit_insurable_salary == null ? basic : ssnit_insurable_salary), ...result,
    payeTax, gross: basic + allowance, net: basic + allowance - result.ssnitEmployee - payeTax - other };
};

exports.list = async (req, res) => {
  try {
    const { search = '', department_id, status = 'current' } = req.query;
    const params = [req.user.company_id]; let where = 'WHERE e.company_id=$1 AND e.is_active=true';
    if (department_id) { params.push(department_id); where += ` AND e.department_id=$${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`; }
    const recordWhere = status === 'all' ? '' : ` AND sr.status='${status === 'previous' ? 'previous' : 'current'}'`;
    const { rows } = await db.query(`SELECT e.id AS employee_id,e.employee_code,e.first_name,e.last_name,e.job_title,d.name AS department_name,
      sr.* FROM employees e LEFT JOIN LATERAL (SELECT * FROM salary_records sr WHERE sr.employee_id=e.id${recordWhere} ORDER BY sr.effective_from DESC LIMIT 1) sr ON true
      LEFT JOIN departments d ON d.id=e.department_id ${where} ORDER BY e.first_name,e.last_name`, params);
    res.json(rows);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not load salary records' }); }
};
exports.detail = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const employee = await db.query(`SELECT e.id,e.employee_code,e.first_name,e.last_name,e.job_title,d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1 AND e.company_id=$2`, [employeeId, req.user.company_id]);
    if (!employee.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const records = await db.query('SELECT * FROM salary_records WHERE employee_id=$1 AND company_id=$2 ORDER BY effective_from DESC, id DESC', [employeeId, req.user.company_id]);
    res.json({ employee: employee.rows[0], records: records.rows });
  } catch (error) { res.status(500).json({ error: 'Could not load salary history' }); }
};
exports.set = async (req, res) => {
  const { employee_id, basic_salary, allowances = 0, other_deductions = 0, ssnit_insurable_salary, effective_from } = req.body;
  if (!Number.isInteger(Number(employee_id)) || !effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(effective_from) || ![basic_salary, allowances, other_deductions, ssnit_insurable_salary == null ? basic_salary : ssnit_insurable_salary].every(validMoney)) return res.status(400).json({ error: 'Provide an employee, effective date, and valid non-negative salary amounts' });
  const values = calculation({ basic_salary, allowances, other_deductions, ssnit_insurable_salary }); let client;
  try {
    client = await db.getClient(); await client.query('BEGIN');
    const employee = await client.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE', [employee_id, req.user.company_id]);
    if (!employee.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Active employee not found' }); }
    const current = await client.query("SELECT id,effective_from FROM salary_records WHERE employee_id=$1 AND company_id=$2 AND status='current' FOR UPDATE", [employee_id, req.user.company_id]);
    if (current.rows[0] && effective_from <= String(current.rows[0].effective_from).slice(0, 10)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Effective date must be after the current salary start date' }); }
    if (current.rows[0]) await client.query("UPDATE salary_records SET status='previous',effective_to=$1::date-1,updated_at=NOW() WHERE id=$2", [effective_from, current.rows[0].id]);
    const saved = await client.query(`INSERT INTO salary_records(company_id,employee_id,basic_salary,allowances,ssnit_insurable_salary,gross_salary,employee_ssnit,employer_ssnit,tier1_contribution,tier2_contribution,paye,other_deductions,estimated_net_salary,effective_from,status,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'current',$15) RETURNING *`, [req.user.company_id, employee_id, values.basic, values.allowance, values.insurable, values.gross, values.ssnitEmployee, values.ssnitEmployer, values.pensionTier1, values.pensionTier2, values.payeTax, values.other, values.net, effective_from, req.user.id]);
    await client.query('UPDATE employees SET salary=$1 WHERE id=$2 AND company_id=$3', [values.basic, employee_id, req.user.company_id]);
    await client.query('COMMIT'); res.status(201).json(saved.rows[0]);
  } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); console.error(error); res.status(500).json({ error: 'Could not save salary record' }); } finally { if (client) client.release(); }
};
exports.preview = (req, res) => {
  const { basic_salary = 0, allowances = 0, other_deductions = 0, ssnit_insurable_salary } = req.body;
  if (![basic_salary, allowances, other_deductions, ssnit_insurable_salary == null ? basic_salary : ssnit_insurable_salary].every(validMoney)) return res.status(400).json({ error: 'Provide valid non-negative salary amounts' });
  res.json(calculation({ basic_salary, allowances, other_deductions, ssnit_insurable_salary }));
};
