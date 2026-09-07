const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leavePage = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'pages', 'leave.html'),
  'utf8'
);
const staffPortal = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'pages', 'staff-portal.html'),
  'utf8'
);

function leavePreviewHelpers() {
  const source = leavePage.match(/const LEAVE_DAY_MS[\s\S]*?(?=\nfunction switchTab)/)?.[0];
  assert.ok(source, 'leave day helper block is missing');
  const context = {};
  vm.runInNewContext(`${source}\nthis.helpers = { calendarLeaveDays, leaveDayPolicy, chargeableLeaveDays, availableAnnualLeave };`, context);
  return context.helpers;
}

function staffPreviewHelpers(balance, companyEvents = []) {
  const source = staffPortal.match(/function staffLeaveDateOnly[\s\S]*?(?=\n    function latestPayroll)/)?.[0];
  assert.ok(source, 'staff leave day helper block is missing');
  const calls = [];
  const context = {
    MS_DAY: 86400000,
    portalState: { leaveBalance: balance },
    leaveHolidayDatesByYear: new Map(),
    leaveHolidayLoadsByYear: new Map(),
    leaveHolidayPolicyKey: '',
    api: {
      async get(route) {
        calls.push(route);
        return companyEvents;
      }
    }
  };
  vm.runInNewContext(
    `${source}\nthis.helpers = { leaveDays, staffAnnualAvailableDays, loadStaffCompanyHolidayDates, holidayDates: leaveHolidayDatesByYear };`,
    context
  );
  return { ...context.helpers, calls };
}

test('annual leave day helper follows weekend and company-holiday policy', () => {
  const { chargeableLeaveDays } = leavePreviewHelpers();
  const companyEvents = [
    { category: 'holiday', start_date: '2024-06-17', end_date: '2024-06-17' },
    { category: 'event', start_date: '2024-06-14', end_date: '2024-06-14' }
  ];

  assert.equal(chargeableLeaveDays(
    '2024-06-14', '2024-06-17', 'annual',
    { count_weekends: false, count_public_holidays: false }, companyEvents
  ), 1);
  assert.equal(chargeableLeaveDays(
    '2024-06-14', '2024-06-17', 'annual',
    { count_weekends: false, count_public_holidays: true }, companyEvents
  ), 2);
  assert.equal(chargeableLeaveDays(
    '2024-06-14', '2024-06-17', 'annual',
    { count_weekends: true, count_public_holidays: true }, companyEvents
  ), 4);
  assert.equal(chargeableLeaveDays(
    '2024-06-14', '2024-06-17', 'sick',
    { count_weekends: false, count_public_holidays: false }, companyEvents
  ), 4);
});

test('HR available leave deducts policy-aware pending reservations', () => {
  const { availableAnnualLeave } = leavePreviewHelpers();
  assert.equal(availableAnnualLeave({
    annual_entitlement: 20,
    annual_used_days: 6,
    annual_pending_days: 3,
    annual_remaining_days: 14
  }), 11);
});

test('request preview uses the employee-safe policy contract and company holidays', () => {
  assert.match(leavePage, /api\.get\(`\/leave\/balance\?year=\$\{year\}`\)/);
  assert.match(leavePage, /balance\.count_weekends !== false/);
  assert.match(leavePage, /balance\.count_public_holidays !== false/);
  assert.match(leavePage, /api\.get\(`\/company-calendar\?from=\$\{range\.from\}&to=\$\{range\.to\}`\)/);
  assert.match(leavePage, /event\.category === 'holiday'/);
  assert.match(leavePage, /Chargeable annual leave:/);
  assert.match(leavePage, /entitlement - used - pending/);
  assert.doesNotMatch(leavePage, /Math\.ceil\(\(new Date\([^\n]+end_date[^\n]+start_date/);
});

test('staff portal caches company holidays and applies both annual day-count rules', async () => {
  const helpers = staffPreviewHelpers(
    { count_weekends: false, count_public_holidays: false },
    [
      { category: 'holiday', start_date: '2024-06-17', end_date: '2024-06-17' },
      { category: 'meeting', start_date: '2024-06-14', end_date: '2024-06-14' }
    ]
  );

  await helpers.loadStaffCompanyHolidayDates(2024);
  await helpers.loadStaffCompanyHolidayDates(2024);

  assert.deepEqual(helpers.calls, ['/company-calendar?from=2024-01-01&to=2024-12-31']);
  assert.equal(helpers.leaveDays({
    leave_type: 'annual', start_date: '2024-06-14', end_date: '2024-06-17'
  }), 1);
  assert.equal(helpers.leaveDays({
    leave_type: 'sick', start_date: '2024-06-14', end_date: '2024-06-17'
  }), 4);
});

test('staff portal availability fallback reserves pending annual leave', () => {
  const fallback = staffPreviewHelpers({ entitlement: 20, used: 6, pending: 3 });
  assert.equal(fallback.staffAnnualAvailableDays(), 11);

  const authoritative = staffPreviewHelpers({ entitlement: 20, used: 6, pending: 3, available: 8 });
  assert.equal(authoritative.staffAnnualAvailableDays(), 8);
  assert.equal(authoritative.staffAnnualAvailableDays(undefined, undefined, undefined, {
    year: 2027, entitlement: 25, used: 2, pending: 1, available: 22
  }), 22);
});

test('staff request preview, history, and next leave share the policy-aware counter', () => {
  assert.match(staffPortal, /count_weekends: balance\?\.count_weekends !== false/);
  assert.match(staffPortal, /count_public_holidays: balance\?\.count_public_holidays !== false/);
  assert.match(staffPortal, /api\.get\(`\/company-calendar\?from=\$\{year\}-01-01&to=\$\{year\}-12-31`\)/);
  assert.match(staffPortal, /api\.get\(`\/leave\/balance\?year=\$\{year\}`\)/);
  assert.match(staffPortal, /staffAnnualAvailableDays\(undefined, undefined, undefined, yearBalance\)/);
  assert.match(staffPortal, /await prepareStaffLeaveDays\(leaves\)/);
  assert.match(staffPortal, /updateLeaveDurationPreview/);
  assert.match(staffPortal, /const days = leaveDays\(next\)/);
  assert.match(staffPortal, /const days = leaveDays\(leave\)/);
  assert.match(staffPortal, /entitlement - used - pending/);
  assert.doesNotMatch(staffPortal, /Math\.round\(\(new Date\(`\$\{end\.value\}/);
});
