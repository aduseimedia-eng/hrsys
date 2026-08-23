const supportedCurrencies = new Set(
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UYW UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL'.split(' '),
);

function normalizeCurrency(value) {
  const code = String(value || '').trim().toUpperCase();
  return supportedCurrencies.has(code) ? code : null;
}

function currencyFractionDigits(value = 'USD') {
  const currency = normalizeCurrency(value) || 'USD';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency })
      .resolvedOptions().maximumFractionDigits;
  } catch (_) {
    return 2;
  }
}

function roundToFractionDigits(value, fractionDigits = 2) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const requestedDigits = Number(fractionDigits);
  const digits = Number.isInteger(requestedDigits) && requestedDigits >= 0 && requestedDigits <= 4
    ? requestedDigits
    : 2;
  const factor = 10 ** digits;
  return Math.round((amount + Math.sign(amount || 1) * Number.EPSILON) * factor) / factor;
}

function roundCurrency(value, currency = 'USD') {
  return roundToFractionDigits(value, currencyFractionDigits(currency));
}

module.exports = { currencyFractionDigits, normalizeCurrency, roundCurrency, roundToFractionDigits, supportedCurrencies };
