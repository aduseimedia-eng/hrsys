// Ghana resident monthly payroll rules. Keep these values versioned and review
// them whenever GRA or SSNIT publishes a change.
const MONTHLY_PAYE_BANDS = [
  [490, 0], [110, 0.05], [130, 0.10], [3166.67, 0.175],
  [16000, 0.25], [30520, 0.30], [Infinity, 0.35]
];

const EMPLOYEE_SSNIT_RATE = 0.055;
const EMPLOYER_SSNIT_RATE = 0.13;
const TIER_1_TOTAL_RATE = 0.135;
const TIER_2_RATE = 0.05;
const TIER_1_EMPLOYER_RATE = TIER_1_TOTAL_RATE - EMPLOYEE_SSNIT_RATE;
// SSNIT 2026 maximum insurable earnings: GH¢69,000 annually (GH¢5,750 monthly).
const MONTHLY_SSNIT_CAP = 25000;
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function calculatePaye(chargeableIncome) {
  let remaining = Math.max(0, Number(chargeableIncome) || 0);
  let tax = 0;
  for (const [band, rate] of MONTHLY_PAYE_BANDS) {
    const portion = Math.min(remaining, band);
    tax += portion * rate;
    remaining -= portion;
    if (remaining <= 0) break;
  }
  return money(tax);
}

function calculateMonthlyPayroll({ basicSalary, allowances = 0, otherDeductions = 0 }) {
  const base = Math.max(0, Number(basicSalary) || 0);
  const earnings = Math.max(0, Number(allowances) || 0);
  const ssnitBase = Math.min(base, MONTHLY_SSNIT_CAP);
  const ssnitEmployee = money(ssnitBase * EMPLOYEE_SSNIT_RATE);
  const ssnitEmployer = money(ssnitBase * EMPLOYER_SSNIT_RATE);
  const pensionTier1 = money(ssnitBase * TIER_1_TOTAL_RATE);
  const pensionTier2 = money(ssnitBase * TIER_2_RATE);
  const payeTax = calculatePaye(base + earnings - ssnitEmployee);
  const other = Math.max(0, Number(otherDeductions) || 0);
  return {
    pensionableEarnings: money(ssnitBase),
    ssnitEmployee,
    ssnitEmployer,
    pensionTier1,
    pensionTier2,
    payeTax,
    otherDeductions: money(other),
    deductions: money(ssnitEmployee + payeTax + other)
  };
}

module.exports = { EMPLOYEE_SSNIT_RATE, EMPLOYER_SSNIT_RATE, TIER_1_TOTAL_RATE, TIER_2_RATE, TIER_1_EMPLOYER_RATE, MONTHLY_SSNIT_CAP, MONTHLY_PAYE_BANDS, calculatePaye, calculateMonthlyPayroll };
