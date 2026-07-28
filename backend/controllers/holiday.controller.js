function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return isoDate(copy.getUTCFullYear(), copy.getUTCMonth() + 1, copy.getUTCDate());
}

function firstFridayInDecember(year) {
  const date = new Date(Date.UTC(year, 11, 1));
  date.setUTCDate(1 + ((5 - date.getUTCDay() + 7) % 7));
  return isoDate(year, 12, date.getUTCDate());
}

function ghanaPublicHolidays(year) {
  const easter = easterSunday(year);
  const holidays = [
    ['New Year’s Day', isoDate(year, 1, 1)],
    ['Constitution Day', isoDate(year, 1, 7)],
    ['Independence Day', isoDate(year, 3, 6)],
    ['Good Friday', addDays(easter, -2)],
    ['Easter Monday', addDays(easter, 1)],
    ['Labour Day (Workers’ Day)', isoDate(year, 5, 1)],
    ['Republic Day', isoDate(year, 7, 1)],
    ['Founder’s Day', isoDate(year, 9, 21)],
    ['Farmer’s Day', firstFridayInDecember(year)],
    ['Christmas Day', isoDate(year, 12, 25)],
    ['Boxing Day', isoDate(year, 12, 26)]
  ];

  // Dates formally announced by Ghana's Ministry of the Interior for 2026.
  if (year === 2026) {
    return [
      ['New Year’s Day', '2026-01-01'], ['Constitution Day', '2026-01-07'],
      ['Independence Day', '2026-03-06'], ['Eid-Ul-Fitr', '2026-03-20'],
      ['Shaqq Day', '2026-03-21'], ['Day in lieu of Shaqq Day', '2026-03-23'],
      ['Good Friday', '2026-04-03'], ['Easter Monday', '2026-04-06'],
      ['Labour Day (Workers’ Day)', '2026-05-01'], ['Republic Day', '2026-07-03'],
      ['Founder’s Day', '2026-09-21'], ['Farmer’s Day', '2026-12-04'],
      ['Christmas Day', '2026-12-25'], ['Boxing Day holiday', '2026-12-28']
    ].map(([name, date]) => ({ name, date }));
  }
  return holidays.map(([name, date]) => ({ name, date }));
}

exports.getPublicHolidays = (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return res.status(400).json({ error: 'Enter a valid year' });
  res.json({ country: 'Ghana', year, holidays: ghanaPublicHolidays(year) });
};
