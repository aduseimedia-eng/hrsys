const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const payrollController = require('../controllers/payroll.controller');
const { getEffectiveRuleSet } = require('../services/payroll-rule-set.service');
const {
  MAX_PAYE_BRACKETS,
  PayrollRuleValidationError,
  canonicalDate,
  decorateRuleHistory,
  nextCompanyRuleVersion,
  validatePayeBrackets,
  validateRuleSettings
} = require('../services/payroll-rule-settings.service');

const originalQuery = db.query;
const originalGetClient = db.getClient;

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function transaction(handler) {
  const calls = [];
  const client = {
    released: false,
    async query(text, params) {
      calls.push({ text, params });
      if (/pg_advisory_xact_lock/i.test(text)) return { rows: [] };
      return handler(text, params, calls);
    },
    release() { this.released = true; }
  };
  db.getClient = async () => client;
  return { calls, client };
}

function validSsnit(overrides = {}) {
  return {
    effective_from: '2027-01-01',
    employee_rate: '0.055',
    employer_rate: '0.13',
    maximum_amount: '5750.00',
    change_reason: 'Annual compliance review',
    ...overrides
  };
}

function validPayeBrackets() {
  return [
    { lower_bound: '0', upper_bound: '490', rate: '0' },
    { lower_bound: '490', upper_bound: '600', rate: '0.05' },
    { lower_bound: '600', upper_bound: null, rate: '0.1' }
  ];
}

test.afterEach(() => {
  db.query = originalQuery;
  db.getClient = originalGetClient;
});

test('payroll rule dates require strict real calendar dates', () => {
  for (const value of [
    '2026-02-29', '2026-04-31', '2026-13-01', '2026-2-01',
    '2026-01-01T00:00:00Z', '0000-01-01'
  ]) {
    assert.throws(() => canonicalDate(value), PayrollRuleValidationError, value);
  }
  assert.equal(canonicalDate('2028-02-29'), '2028-02-29');
  assert.throws(
    () => validateRuleSettings('GH-SSNIT', validSsnit({ effective_to: '2026-12-31' })),
    /on or after effective from/i
  );
});

test('SSNIT settings require positive rates at most one and a positive ceiling', () => {
  for (const overrides of [
    { employee_rate: '' },
    { employee_rate: '0x0.1' },
    { employee_rate: '5.5e-2' },
    { employee_rate: '0' },
    { employee_rate: '0.055000001' },
    { employee_rate: '1.00000001' },
    { employer_rate: '-0.1' },
    { employer_rate: '0' },
    { maximum_amount: '0' },
    { maximum_amount: '-1' },
    { maximum_amount: '5750.00001' },
    { maximum_amount: '1000000000000000' },
    { change_reason: '   ' },
    { change_reason: 'x'.repeat(1001) }
  ]) {
    assert.throws(() => validateRuleSettings('GH-SSNIT', validSsnit(overrides)), PayrollRuleValidationError);
  }
  const settings = validateRuleSettings('gh-ssnit', validSsnit());
  assert.equal(settings.code, 'GH-SSNIT');
  assert.equal(settings.employeeRate, '0.055');
  assert.equal(settings.employerRate, '0.13');
  assert.equal(settings.maximumAmount, '5750');
});

test('PAYE settings require ordered contiguous bands ending in one open band', () => {
  const invalid = [
    [{ lower_bound: '1', upper_bound: null, rate: '0.1' }],
    [{ lower_bound: '-1', upper_bound: null, rate: '0.1' }],
    [{ lower_bound: '0', upper_bound: '0', rate: '0.1' }, { lower_bound: '0', upper_bound: null, rate: '0.2' }],
    [{ lower_bound: '0', upper_bound: '100', rate: '0.1' }, { lower_bound: '101', upper_bound: null, rate: '0.2' }],
    [{ lower_bound: '0', upper_bound: '100', rate: '0.1' }, { lower_bound: '90', upper_bound: null, rate: '0.2' }],
    [{ lower_bound: '0', upper_bound: null, rate: '0.1' }, { lower_bound: '100', upper_bound: null, rate: '0.2' }],
    [{ lower_bound: '0', upper_bound: '100', rate: '0.1' }],
    [{ lower_bound: '0', upper_bound: null, rate: '' }],
    [{ lower_bound: '0', upper_bound: null, rate: '-0.01' }],
    [{ lower_bound: '0', upper_bound: null, rate: '1.01' }]
  ];
  for (const brackets of invalid) {
    assert.throws(() => validatePayeBrackets(brackets), PayrollRuleValidationError);
  }
  assert.throws(
    () => validatePayeBrackets(Array.from({ length: MAX_PAYE_BRACKETS + 1 }, (_, index) => ({
      lower_bound: String(index),
      upper_bound: index === MAX_PAYE_BRACKETS ? null : String(index + 1),
      rate: '0.1'
    }))),
    /at most/i
  );
  assert.deepEqual(validatePayeBrackets(validPayeBrackets()), [
    { lower_bound: '0', upper_bound: '490', rate: '0', fixed_amount: '0' },
    { lower_bound: '490', upper_bound: '600', rate: '0.05', fixed_amount: '0' },
    { lower_bound: '600', upper_bound: null, rate: '0.1', fixed_amount: '0' }
  ]);
});

test('company rule versions use the first free revision after inactive replacements', () => {
  const base = 'GH-PAYE-C77-2027-01-01';
  assert.equal(nextCompanyRuleVersion('GH-PAYE', 77, '2027-01-01', []), base);
  assert.equal(nextCompanyRuleVersion('GH-PAYE', 77, '2027-01-01', [
    { version: base },
    { version: `${base}-R1` },
    { version: `${base}-R3` }
  ]), `${base}-R2`);
});

test('rule history marks only the newest applicable company version current', () => {
  const rows = [
    { statutory_rule_version_id: 1, code: 'GH-PAYE', company_id: null, active: true, effective_from: '2024-01-01', effective_to: null },
    { statutory_rule_version_id: 2, code: 'GH-PAYE', company_id: 77, active: true, effective_from: '2026-01-01', effective_to: '2026-12-31' },
    { statutory_rule_version_id: 3, code: 'GH-PAYE', company_id: 77, active: true, effective_from: '2027-01-01', effective_to: null }
  ];
  const history = decorateRuleHistory(rows, '2026-09-06');
  assert.equal(history[0].statutory_rule_version_id, 2);
  assert.equal(history[0].source, 'company');
  assert.equal(history[0].status, 'current');
  assert.equal(history[0].is_current, true);
  assert.equal(history.find((row) => row.statutory_rule_version_id === 3).status, 'scheduled');
  assert.equal(history.find((row) => row.statutory_rule_version_id === 1).status, 'superseded');
});

test('GET payroll rule settings returns compatible flat history with source and status metadata', async () => {
  let query;
  db.query = async (text, params) => {
    query = { text, params };
    return { rows: [
      {
        statutory_rule_id: 5, statutory_rule_version_id: 10, code: 'GH-SSNIT', category: 'social_security',
        company_id: null, active: true, effective_from: '2026-01-01', effective_to: null, tax_brackets: []
      },
      {
        statutory_rule_id: 5, statutory_rule_version_id: 11, code: 'GH-SSNIT', category: 'social_security',
        company_id: 77, active: true, effective_from: '2026-06-01', effective_to: null, tax_brackets: []
      },
      {
        statutory_rule_id: 5, statutory_rule_version_id: 12, code: 'GH-SSNIT', category: 'social_security',
        company_id: 77, active: true, effective_from: '2027-01-01', effective_to: null, tax_brackets: []
      }
    ] };
  };
  const res = response();
  await payrollController.getRuleSettings({ user: { company_id: 77 }, query: { as_of: '2026-09-06' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].statutory_rule_version_id, 11);
  assert.equal(res.body[0].source, 'company');
  assert.equal(res.body[0].status, 'current');
  assert.equal(res.body.find((row) => row.statutory_rule_version_id === 12).status, 'scheduled');
  assert.deepEqual(query.params, [77, 'GH']);
  assert.match(query.text, /to_char\(srv\.effective_from, 'YYYY-MM-DD'\)/i);
  assert.match(query.text, /sr\.id AS statutory_rule_id/i);
  assert.match(query.text, /srv\.id AS statutory_rule_version_id/i);
});

test('GET payroll rule settings rejects an invalid as-of date before querying', async () => {
  let queried = false;
  db.query = async () => { queried = true; return { rows: [] }; };
  const res = response();
  await payrollController.getRuleSettings({ user: { company_id: 77 }, query: { as_of: '2026-02-30' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('POST payroll rule settings rejects invalid input before opening a transaction', async () => {
  let connected = false;
  db.getClient = async () => { connected = true; throw new Error('should not connect'); };
  const res = response();
  await payrollController.saveRuleSettings({
    params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 },
    body: validSsnit({ effective_from: '2026-02-30' })
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(connected, false);
});

test('effective rule resolution selects one newest company-or-global version per rule', async () => {
  let query;
  const expected = [
    { statutory_rule_id: 1, statutory_rule_version_id: 21, code: 'GH-SSNIT', category: 'social_security', source: 'company' },
    { statutory_rule_id: 2, statutory_rule_version_id: 31, code: 'GH-PAYE', category: 'tax', source: 'global' }
  ];
  const executor = {
    async query(text, params) { query = { text, params }; return { rows: expected }; }
  };
  const rules = await getEffectiveRuleSet({
    countryCode: ' gh ', effectiveDate: '2026-09-30', companyId: 77, executor
  });
  assert.deepEqual(rules, expected);
  assert.deepEqual(query.params, ['GH', '2026-09-30', 77]);
  assert.match(query.text, /JOIN LATERAL/i);
  assert.match(query.text, /candidate\.effective_from DESC, candidate\.id DESC/i);
  assert.match(query.text, /CASE WHEN candidate\.company_id=\$3 THEN 0 ELSE 1 END/i);
  assert.match(query.text, /LIMIT 1/i);
  assert.match(query.text, /sr\.category/i);
  assert.match(query.text, /statutory_rule_version_id/i);
});

test('scheduling between company versions closes the prior range, bounds the new range, and audits', async () => {
  const { calls, client } = transaction(async (text) => {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
    if (/FROM statutory_rules sr/i.test(text)) {
      return { rows: [{ id: 5, code: 'GH-SSNIT', name: 'SSNIT', category: 'social_security', currency_code: 'GHS' }] };
    }
    if (/FROM statutory_rule_versions/i.test(text) && /FOR UPDATE/i.test(text)) {
      return { rows: [
        { id: 31, active: true, effective_from: '2026-01-01', effective_to: null },
        { id: 33, active: true, effective_from: '2027-01-01', effective_to: null }
      ] };
    }
    if (/INSERT INTO statutory_rule_versions/i.test(text)) {
      return { rows: [{ id: 32, effective_from: '2026-10-01', effective_to: '2026-12-31' }] };
    }
    return { rows: [] };
  });
  const res = response();
  await payrollController.saveRuleSettings({
    params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 },
    body: validSsnit({ effective_from: '2026-10-01', change_reason: 'New statutory notice' })
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.effective_from, '2026-10-01');
  assert.equal(res.body.effective_to, '2026-12-31');
  const advisoryLock = calls.find((call) => /pg_advisory_xact_lock/i.test(call.text));
  assert.deepEqual(advisoryLock.params, [5, 77]);
  assert.ok(calls.indexOf(advisoryLock) < calls.findIndex((call) => /FROM statutory_rule_versions/i.test(call.text)));
  const priorUpdate = calls.find((call) => /UPDATE statutory_rule_versions/i.test(call.text));
  assert.deepEqual(priorUpdate.params, ['2026-09-30', 31, 77]);
  const versionInsert = calls.find((call) => /INSERT INTO statutory_rule_versions/i.test(call.text));
  assert.equal(versionInsert.params[5], '0.055');
  assert.equal(versionInsert.params[6], '0.13');
  assert.equal(versionInsert.params[7], '5750');
  assert.equal(versionInsert.params[9], '2026-10-01');
  assert.equal(versionInsert.params[10], '2026-12-31');
  const audit = calls.find((call) => /INSERT INTO audit_logs/i.test(call.text));
  assert.deepEqual(audit.params.slice(0, 3), [77, 9, 32]);
  assert.match(audit.params[3], /GH-SSNIT.*2026-10-01.*2026-12-31.*New statutory notice/i);
  assert.ok(calls.findIndex((call) => /INSERT INTO audit_logs/i.test(call.text)) < calls.findIndex((call) => call.text === 'COMMIT'));
  assert.equal(client.released, true);
});

test('PAYE scheduling preserves validated bracket order and decimal strings', async () => {
  const { calls } = transaction(async (text) => {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
    if (/FROM statutory_rules sr/i.test(text)) return { rows: [{ id: 6, code: 'GH-PAYE', currency_code: 'GHS' }] };
    if (/FROM statutory_rule_versions/i.test(text) && /FOR UPDATE/i.test(text)) return { rows: [] };
    if (/INSERT INTO statutory_rule_versions/i.test(text)) return { rows: [{ id: 41, effective_from: '2027-01-01', effective_to: null }] };
    return { rows: [] };
  });
  const res = response();
  await payrollController.saveRuleSettings({
    params: { code: 'GH-PAYE' }, user: { id: 9, company_id: 77 },
    body: { effective_from: '2027-01-01', change_reason: 'Updated tax bands', tax_brackets: validPayeBrackets() }
  }, res);
  assert.equal(res.statusCode, 201);
  const inserts = calls.filter((call) => /INSERT INTO tax_brackets/i.test(call.text));
  assert.deepEqual(inserts.map((call) => call.params), [
    [41, '0', '490', '0', '0'],
    [41, '490', '600', '0.05', '0'],
    [41, '600', null, '0.1', '0']
  ]);
});

test('an inactive same-date override can be replaced with a unique revision', async () => {
  const baseVersion = 'GH-SSNIT-C77-2027-01-01';
  const { calls } = transaction(async (text) => {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
    if (/FROM statutory_rules sr/i.test(text)) {
      return { rows: [{ id: 5, code: 'GH-SSNIT', category: 'social_security', currency_code: 'GHS' }] };
    }
    if (/FROM statutory_rule_versions/i.test(text) && /FOR UPDATE/i.test(text)) {
      return { rows: [
        { id: 31, version: baseVersion, active: false, effective_from: '2027-01-01', effective_to: null },
        { id: 32, version: `${baseVersion}-R1`, active: false, effective_from: '2027-01-01', effective_to: null }
      ] };
    }
    if (/INSERT INTO statutory_rule_versions/i.test(text)) {
      return { rows: [{ id: 33, effective_from: '2027-01-01', effective_to: null }] };
    }
    return { rows: [] };
  });
  const res = response();
  await payrollController.saveRuleSettings({
    params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 }, body: validSsnit()
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.version, `${baseVersion}-R2`);
  const insert = calls.find((call) => /INSERT INTO statutory_rule_versions/i.test(call.text));
  assert.equal(insert.params[2], `${baseVersion}-R2`);
});

test('duplicate or overlapping company rule schedules return conflict without writes', async (t) => {
  await t.test('duplicate effective date', async () => {
    const { calls, client } = transaction(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return {};
      if (/FROM statutory_rules sr/i.test(text)) return { rows: [{ id: 5, currency_code: 'GHS' }] };
      if (/FROM statutory_rule_versions/i.test(text)) {
        return { rows: [{ id: 31, active: true, effective_from: '2027-01-01', effective_to: null }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    });
    const res = response();
    await payrollController.saveRuleSettings({
      params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 }, body: validSsnit()
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(calls.some((call) => /INSERT INTO statutory_rule_versions/i.test(call.text)), false);
    assert.equal(client.released, true);
  });

  await t.test('explicit overlap with the next version', async () => {
    const { calls } = transaction(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return {};
      if (/FROM statutory_rules sr/i.test(text)) return { rows: [{ id: 5, currency_code: 'GHS' }] };
      if (/FROM statutory_rule_versions/i.test(text)) {
        return { rows: [{ id: 33, active: true, effective_from: '2028-01-01', effective_to: null }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    });
    const res = response();
    await payrollController.saveRuleSettings({
      params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 },
      body: validSsnit({ effective_to: '2028-01-01' })
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(calls.some((call) => /INSERT INTO statutory_rule_versions/i.test(call.text)), false);
    assert.equal(calls.some((call) => /INSERT INTO audit_logs/i.test(call.text)), false);
  });
});

test('a duplicate raised during insert is translated to 409 and rolled back', async () => {
  const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
  const { calls, client } = transaction(async (text) => {
    if (text === 'BEGIN' || text === 'ROLLBACK') return {};
    if (/FROM statutory_rules sr/i.test(text)) return { rows: [{ id: 5, currency_code: 'GHS' }] };
    if (/FROM statutory_rule_versions/i.test(text) && /FOR UPDATE/i.test(text)) return { rows: [] };
    if (/INSERT INTO statutory_rule_versions/i.test(text)) throw duplicate;
    throw new Error(`Unexpected query: ${text}`);
  });
  const res = response();
  await payrollController.saveRuleSettings({
    params: { code: 'GH-SSNIT' }, user: { id: 9, company_id: 77 }, body: validSsnit()
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(calls.some((call) => /INSERT INTO audit_logs/i.test(call.text)), false);
  assert.equal(client.released, true);
});

test('payroll tax settings migration stays extension-free and adds portable guards', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', 'database', 'migrations', '072_payroll_tax_settings.sql'),
    'utf8'
  );
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION|EXCLUDE\s+USING/i);
  assert.match(migration, /ALTER COLUMN rule_set_version TYPE TEXT/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_versions_company_effective_start/i);
  assert.match(migration, /Deactivated during migration: invalid legacy SSNIT settings/i);
  assert.match(migration, /Deactivated during migration: invalid legacy PAYE bracket settings/i);
  assert.match(migration, /count\(bracket_id\)=0/i);
  assert.match(migration, /bracket_position > 1 AND lower_bound IS DISTINCT FROM previous_upper_bound/i);
  assert.match(migration, /bracket_position < bracket_count AND upper_bound IS NULL/i);
  assert.match(migration, /bracket_position = bracket_count AND upper_bound IS NOT NULL/i);
  assert.match(migration, /rate IS NULL OR rate < 0 OR rate > 1/i);
  assert.match(migration, /change_reason/i);
  assert.match(migration, /employee_rate > 0 AND employee_rate <= 1/i);
});
