const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function mockClient() {
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const window = { location: { pathname: '/pages/settings.html', href: '' } };
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'mock-api.js'),
    'utf8'
  );
  vm.runInNewContext(source, {
    window,
    localStorage,
    URL,
    Date,
    console,
    setTimeout,
    clearTimeout
  });

  const signIn = (user) => {
    localStorage.setItem('hr_token', 'mock-token');
    localStorage.setItem('hr_user', JSON.stringify(user));
  };

  return { api: window.hrMockApi, localStorage, signIn };
}

function sundayIn2099() {
  const date = new Date(Date.UTC(2099, 0, 1));
  while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

test('mock mode persists HR working days and applies them to leave and attendance', async () => {
  const { api, localStorage, signIn } = mockClient();
  const admin = { id: 1, company_id: 1, role: 'admin', first_name: 'Ama', last_name: 'Owusu' };
  const employee = { id: 3, company_id: 1, role: 'employee', first_name: 'Akosua', last_name: 'Boateng' };
  signIn(admin);
  api.reset();

  const fallback = await api.request('GET', '/schedules/default');
  assert.deepEqual(Array.from(fallback.working_days), [1, 2, 3, 4, 5]);

  const saved = await api.request('PUT', '/schedules/default', { working_days: [0, 0] });
  assert.deepEqual(Array.from(saved.working_days), [0]);
  await assert.rejects(
    api.request('PUT', '/schedules/default', { working_days: [7] }),
    /select at least one valid working day/i
  );

  signIn({ ...employee, role: 'manager' });
  await assert.rejects(
    api.request('PUT', '/schedules/default', { working_days: [1, 2, 3] }),
    /access denied/i
  );

  signIn(admin);
  const policy = await api.request('PUT', '/leave/settings', {
    annual_entitlement_days: 20,
    count_non_working_days: false,
    count_public_holidays: true,
    max_consecutive_days: null,
    minimum_notice_days: 0
  });
  assert.equal(policy.count_non_working_days, false);
  assert.equal(policy.count_weekends, false);
  assert.deepEqual(Array.from(policy.working_days), [0]);

  signIn(employee);
  const start = sundayIn2099();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const request = await api.request('POST', '/leave', {
    leave_type: 'annual',
    start_date: startDate,
    end_date: endDate,
    reason: 'Working-day regression test'
  });
  const balance = await api.request('GET', '/leave/balance?year=2099');
  assert.equal(balance.pending, 1);
  assert.deepEqual(Array.from(balance.working_days), [0]);

  signIn(admin);
  await api.request('PATCH', `/leave/${request.id}/status`, { status: 'approved' });
  const db = JSON.parse(localStorage.getItem('hr_mock_db_v2'));
  const attendanceDates = db.attendance
    .filter((row) => row.employee_id === employee.id && String(row.work_date).startsWith('2099-'))
    .map((row) => row.work_date);
  assert.deepEqual(attendanceDates, [startDate]);
});
