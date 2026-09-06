const test = require('node:test');
const assert = require('node:assert/strict');

const ghanaProvider = require('../services/payroll-engine/providers/ghana.provider');

function rules() {
  return [
    {
      code: 'GH-SSNIT',
      name: 'SSNIT',
      employee_rate: '0.055',
      employer_rate: '0.13',
      maximum_amount: '5750',
      statutory_rule_id: 11,
      statutory_rule_version_id: 111
    },
    {
      code: 'GH-PAYE',
      name: 'PAYE',
      statutory_rule_id: 12,
      statutory_rule_version_id: 122,
      tax_brackets: [{ lower_bound: 0, upper_bound: null, rate: '0.10', fixed_amount: 0 }]
    }
  ];
}

test('Ghana provider applies effective salary inputs and preserves statutory references', () => {
  const result = ghanaProvider.calculate({
    basicSalary: '5000.00',
    allowances: '200.00',
    ssnitInsurableSalary: '4000.00',
    otherDeductions: '125.555',
    rules: rules(),
    fractionDigits: 2
  });

  assert.equal(result.grossPay.toFixed(2), '5200.00');
  assert.equal(result.pensionablePay.toFixed(2), '4000.00');
  assert.equal(result.employeeSocialSecurity.toFixed(2), '220.00');
  assert.equal(result.employerSocialSecurity.toFixed(2), '520.00');
  assert.equal(result.taxablePay.toFixed(2), '4980.00');
  assert.equal(result.employeeTax.toFixed(2), '498.00');
  assert.equal(result.employeeOtherDeductions.toFixed(2), '125.56');
  assert.equal(result.totalEmployeeDeductions.toFixed(2), '843.56');
  assert.equal(result.netPay.toFixed(2), '4356.44');
  assert.equal(result.totalEmployerCost.toFixed(2), '5720.00');

  const employeeSsnit = result.lineItems.find((item) => item.code === 'GH-SSNIT' && item.party === 'employee');
  const employerSsnit = result.lineItems.find((item) => item.code === 'GH-SSNIT' && item.party === 'employer');
  const paye = result.lineItems.find((item) => item.code === 'GH-PAYE');
  const other = result.lineItems.find((item) => item.code === 'OTHER-DEDUCTION');
  assert.deepEqual(
    [employeeSsnit.statutory_rule_id, employeeSsnit.statutory_rule_version_id],
    [11, 111]
  );
  assert.deepEqual(
    [employerSsnit.statutory_rule_id, employerSsnit.statutory_rule_version_id],
    [11, 111]
  );
  assert.deepEqual([paye.statutory_rule_id, paye.statutory_rule_version_id], [12, 122]);
  assert.equal(other.amount.toFixed(2), '125.56');
});

test('Ghana provider honors SSNIT and PAYE exemptions without dropping other deductions', () => {
  const result = ghanaProvider.calculate({
    basicSalary: '5000.00',
    allowances: '200.00',
    ssnitInsurableSalary: '4000.00',
    otherDeductions: '125.555',
    ssnitExempt: true,
    payeExempt: true,
    rules: rules(),
    fractionDigits: 2
  });

  assert.equal(result.pensionablePay.toFixed(2), '4000.00');
  assert.equal(result.employeeSocialSecurity.toFixed(2), '0.00');
  assert.equal(result.employerSocialSecurity.toFixed(2), '0.00');
  assert.equal(result.taxablePay.toFixed(2), '5200.00');
  assert.equal(result.employeeTax.toFixed(2), '0.00');
  assert.equal(result.totalEmployeeDeductions.toFixed(2), '125.56');
  assert.equal(result.netPay.toFixed(2), '5074.44');
  assert.equal(result.totalEmployerCost.toFixed(2), '5200.00');
  assert.equal(result.lineItems.find((item) => item.code === 'OTHER-DEDUCTION').amount.toFixed(2), '125.56');
});

test('Ghana provider remains compatible with the original basic-salary input shape', () => {
  const result = ghanaProvider.calculate({ basicSalary: '5000.00', rules: rules(), fractionDigits: 2 });

  assert.equal(result.grossPay.toFixed(2), '5000.00');
  assert.equal(result.pensionablePay.toFixed(2), '5000.00');
  assert.equal(result.employeeSocialSecurity.toFixed(2), '275.00');
  assert.equal(result.employeeTax.toFixed(2), '472.50');
  assert.equal(result.lineItems.some((item) => item.code === 'OTHER-DEDUCTION'), false);
});

test('Ghana provider keeps configured currency precision for salary-record inputs', () => {
  const result = ghanaProvider.calculate({
    basicSalary: '1000.1234',
    allowances: '50.006',
    ssnitInsurableSalary: '900.1234',
    otherDeductions: '2.3456',
    rules: rules(),
    fractionDigits: 3
  });

  assert.equal(result.grossPay.toFixed(3), '1050.129');
  assert.equal(result.pensionablePay.toFixed(3), '900.123');
  assert.equal(result.employeeSocialSecurity.toFixed(3), '49.507');
  assert.equal(result.employeeTax.toFixed(3), '100.062');
  assert.equal(result.employeeOtherDeductions.toFixed(3), '2.346');
  assert.equal(result.totalEmployeeDeductions.toFixed(3), '151.915');
  assert.equal(result.netPay.toFixed(3), '898.214');
});
