const Decimal = require('decimal.js');

// Keep calculations in decimal form until persistence or presentation. Never
// use JavaScript floating point values for statutory payroll arithmetic.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function decimal(value = 0) {
  try {
    return new Decimal(value || 0);
  } catch {
    throw new Error('Payroll amounts must be valid decimal values');
  }
}

function money(value, fractionDigits = 2) {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 4) {
    throw new Error('Payroll currency precision must be between 0 and 4 decimal places');
  }
  return decimal(value).toDecimalPlaces(fractionDigits);
}

module.exports = { Decimal, decimal, money };
