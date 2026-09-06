const { Decimal, decimal, money } = require('../money');

const nonNegative = (value) => Decimal.max(decimal(value), decimal(0));
const minimum = (left, right) => Decimal.min(decimal(left), decimal(right));

function requiredRule(rules, code) {
  const rule = rules.find((candidate) => candidate.code === code);
  if (!rule) throw new Error(`Ghana payroll rule ${code} is not configured for this period`);
  return rule;
}

function statutoryReferences(rule) {
  return {
    statutory_rule_id: rule.statutory_rule_id ?? rule.rule_id ?? null,
    statutory_rule_version_id: rule.statutory_rule_version_id ?? rule.rule_version_id ?? null
  };
}

function progressiveTax(income, brackets, fractionDigits) {
  const taxableIncome = nonNegative(income);
  return money(brackets.reduce((total, bracket) => {
    const lower = decimal(bracket.lower_bound);
    const upper = bracket.upper_bound == null ? null : decimal(bracket.upper_bound);
    const taxablePortion = upper
      ? minimum(nonNegative(taxableIncome.minus(lower)), upper.minus(lower))
      : nonNegative(taxableIncome.minus(lower));
    return total.plus(taxablePortion.times(decimal(bracket.rate)).plus(decimal(bracket.fixed_amount || 0)));
  }, decimal(0)), fractionDigits);
}

// Ghana's rule identifiers and statutory treatment intentionally live here,
// outside the country-neutral engine. Rates and bands are injected from the
// effective-dated rule records; they are not hard-coded into this provider.
function calculate({
  basicSalary,
  allowances = 0,
  ssnitInsurableSalary,
  otherDeductions = 0,
  ssnitExempt = false,
  payeExempt = false,
  rules,
  fractionDigits = 2
}) {
  if (!Array.isArray(rules)) throw new Error('An effective Ghana rule set is required');

  const basic = nonNegative(basicSalary);
  const allowanceAmount = nonNegative(allowances);
  const insurableSalary = ssnitInsurableSalary == null ? basic : nonNegative(ssnitInsurableSalary);
  const other = nonNegative(otherDeductions);
  const ssnit = requiredRule(rules, 'GH-SSNIT');
  const paye = requiredRule(rules, 'GH-PAYE');
  if (!Array.isArray(paye.tax_brackets) || !paye.tax_brackets.length) {
    throw new Error('Ghana PAYE tax brackets are not configured for this period');
  }

  const pensionablePay = ssnit.maximum_amount == null
    ? insurableSalary
    : minimum(insurableSalary, ssnit.maximum_amount);
  const employeeSocialSecurity = ssnitExempt
    ? money(0, fractionDigits)
    : money(pensionablePay.times(decimal(ssnit.employee_rate || 0)), fractionDigits);
  const employerSocialSecurity = ssnitExempt
    ? money(0, fractionDigits)
    : money(pensionablePay.times(decimal(ssnit.employer_rate || 0)), fractionDigits);
  const grossPay = money(basic.plus(allowanceAmount), fractionDigits);
  const taxablePay = money(nonNegative(grossPay.minus(employeeSocialSecurity)), fractionDigits);
  const employeeTax = payeExempt
    ? money(0, fractionDigits)
    : progressiveTax(taxablePay, paye.tax_brackets, fractionDigits);
  const employeeOtherDeductions = money(other, fractionDigits);
  const totalEmployeeDeductions = money(employeeSocialSecurity.plus(employeeTax).plus(other), fractionDigits);
  const netPay = money(grossPay.minus(totalEmployeeDeductions), fractionDigits);
  const totalEmployerCost = money(grossPay.plus(employerSocialSecurity), fractionDigits);
  const ssnitReferences = statutoryReferences(ssnit);
  const payeReferences = statutoryReferences(paye);

  return {
    grossPay, taxablePay, pensionablePay: money(pensionablePay, fractionDigits),
    employeeTax, employeeSocialSecurity, employeePension: money(0, fractionDigits),
    employeeOtherDeductions, employerTax: money(0, fractionDigits),
    employerSocialSecurity, employerPension: money(0, fractionDigits), employerOtherContributions: money(0, fractionDigits),
    totalEmployeeDeductions, netPay, totalEmployerCost,
    lineItems: [
      { type: 'earning', code: 'BASIC', name: 'Basic salary', amount: money(basic, fractionDigits), party: 'employee', taxable: true, pensionable: true },
      { type: 'earning', code: 'ALLOWANCE', name: 'Allowances', amount: money(allowanceAmount, fractionDigits), party: 'employee', taxable: true, pensionable: false },
      { type: 'deduction', code: ssnit.code, name: ssnit.name, amount: employeeSocialSecurity, party: 'employee', taxable: false, pensionable: false, ...ssnitReferences },
      { type: 'contribution', code: ssnit.code, name: ssnit.name, amount: employerSocialSecurity, party: 'employer', taxable: false, pensionable: false, ...ssnitReferences },
      { type: 'tax', code: paye.code, name: paye.name, amount: employeeTax, party: 'employee', taxable: false, pensionable: false, ...payeReferences },
      ...(employeeOtherDeductions.gt(0)
        ? [{ type: 'deduction', code: 'OTHER-DEDUCTION', name: 'Other deductions', amount: employeeOtherDeductions, party: 'employee', taxable: false, pensionable: false }]
        : [])
    ]
  };
}

module.exports = { calculate };
