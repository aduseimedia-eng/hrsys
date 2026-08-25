const providers = {
  GH: require('./providers/ghana.provider')
};

function calculatePayroll({ countryCode, ...input }) {
  const provider = providers[String(countryCode || '').trim().toUpperCase()];
  if (!provider) throw new Error(`No payroll provider is enabled for country ${countryCode || 'unknown'}`);
  return provider.calculate(input);
}

module.exports = { calculatePayroll };
