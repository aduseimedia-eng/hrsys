const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('company settings separates policy configuration from operational records', () => {
  const page = read('frontend/pages/settings.html');

  assert.match(page, /<title>Company Settings - KenadHR<\/title>/);
  assert.match(page, /id="time-leave-settings"/);
  assert.match(page, /id="payroll-tax-settings"/);
  assert.match(page, /api\.get\('\/leave\/settings'\)/);
  assert.match(page, /api\.put\('\/leave\/settings', payload\)/);
  assert.match(page, /api\.get\('\/schedules\/default'\)/);
  assert.match(page, /api\.put\('\/schedules\/default', \{ working_days: workingDays \}\)/);
  assert.match(page, /api\.get\('\/attendance\/overtime\/settings'\)/);
  assert.match(page, /api\.put\('\/attendance\/overtime\/settings',/);
  assert.match(page, /id="working-days-form"/);
  assert.match(page, /<fieldset class="settings-working-days"[^>]*disabled>/);
  assert.match(page, /id="working-days-submit"[^>]*disabled/);
  assert.match(page, /if \(workingDaysLoadPromise\) return workingDaysLoadPromise/);
  assert.match(page, /id="leave-count-non-working-days"/);
  assert.match(page, /count_non_working_days:/);
  assert.doesNotMatch(page, /id="company-work-week"|id="leave-count-weekends"/);

  const workingDayInputs = [...page.matchAll(/name="company-working-day" value="([0-6])"/g)];
  assert.equal(workingDayInputs.length, 7, 'all seven company working days must be selectable');
  assert.deepEqual(workingDayInputs.map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6, 0]);

  for (const route of [
    'departments', 'orgchart', 'recruitment-settings', 'benefits', 'pensions',
    'users-access', 'roles-permissions', 'notification-settings', 'integrations',
    'audit', 'calendar'
  ]) {
    assert.match(page, new RegExp(`href="workspace\\.html#${route}"`));
  }

  assert.doesNotMatch(page, /api\.(?:get|post|put|patch|delete)\(['"`]\/(?:company-calendar|audit|notifications\/announcements|employees\/departments)/);
});

test('personal settings is shared by every signed-in role and uses account endpoints', () => {
  const page = read('frontend/pages/account-settings.html');
  const api = read('frontend/js/api.js');
  const workspace = read('frontend/pages/workspace.html');
  const staffPortal = read('frontend/pages/staff-portal.html');

  assert.match(page, /\['admin', 'manager', 'employee'\]/);
  for (const endpoint of ['/auth/me', '/auth/email', '/auth/password', '/employees/me/photo']) {
    assert.ok(page.includes(endpoint), `${endpoint} is not wired into My settings`);
  }

  assert.match(api, /page: 'account-settings'[\s\S]*roles: \['admin','manager','employee'\]/);
  assert.match(api, /page: 'settings'[\s\S]*roles: \['admin'\]/);
  assert.match(workspace, /'account-settings': \{ title: 'My Settings'/);
  assert.match(workspace, /settings: \{ title: 'Company Settings',[^\n]*roles: \['admin'\]/);
  assert.match(staffPortal, /href="account-settings\.html"/);
  assert.doesNotMatch(staffPortal, /data-staff-page="settings"/);
});

test('company settings uses the restrained rectangular visual system', () => {
  const page = read('frontend/pages/settings.html');
  const css = read('frontend/css/settings.css');

  assert.match(page, /href="\.\.\/css\/settings\.css\?v=/);
  assert.doesNotMatch(page, /border-radius:\s*(?:50%|999(?:px|rem)?)/i);
  assert.match(css, /#company-branding \.brand-color-wheel[\s\S]*?border-radius:\s*4px/);
  assert.doesNotMatch(css, /border-radius:\s*(?:50%|999(?:px|rem)?)/i);
  assert.match(css, /--settings-border:\s*#e1e4e8/);
});

test('company settings keeps navigation outside the scrollable detail pane', () => {
  const page = read('frontend/pages/settings.html');
  const css = read('frontend/css/settings.css');
  const workspace = read('frontend/pages/workspace.html');

  assert.match(page, /<nav class="settings-section-nav"[\s\S]*?<\/nav>\s*<div class="settings-content">/);
  assert.match(css, /body:not\(\.embedded-page\) \.main-content\s*\{[^}]*height:\s*calc\(100dvh - var\(--topbar-h\)\)[^}]*overflow:\s*hidden/);
  assert.match(css, /body\.embedded-page \.main-content\s*\{[^}]*height:\s*100dvh !important[^}]*overflow:\s*hidden !important/);
  assert.match(css, /body \.settings-hub\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)[^}]*overflow:\s*hidden/);
  assert.match(css, /body \.settings-hub > \.settings-section-nav\s*\{[^}]*position:\s*static[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/);
  assert.match(css, /body \.settings-hub > \.settings-content\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?body \.settings-hub\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(workspace, /settings:\s*\{[^}]*containedScroll:\s*true/);
  assert.match(workspace, /workspaceFrame\.dataset\.scrollMode === 'contained'[\s\S]*?\? minimumHeight/);
});
