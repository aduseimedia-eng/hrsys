(() => {
  'use strict';

  const state = {
    rules: [],
    staff: [],
    activeStaff: null,
    requestId: 0,
    loaded: false
  };

  const element = (id) => document.getElementById(id);
  const safe = (value) => escapeUi(String(value ?? ''));

  function dateKey(value) {
    const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function dateFromParts(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function todayKey() {
    return dateFromParts(new Date());
  }

  function addDateDays(value, days) {
    const key = dateKey(value);
    if (!key) return todayKey();
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function displayDate(value) {
    const key = dateKey(value);
    if (!key) return 'No date';
    const [year, month, day] = key.split('-');
    const format = String(api.getCompanyPreferences?.()?.date_format || 'DD/MM/YYYY').toUpperCase();
    if (format === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
    if (format === 'YYYY-MM-DD') return key;
    return `${day}/${month}/${year}`;
  }

  function decimalRateToPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number((number * 100).toFixed(6)) : '';
  }

  function percentToDecimal(value) {
    return (Number(value) / 100).toFixed(8);
  }

  function showAlert(message, target = element('payroll-settings-alert')) {
    if (!target) return;
    target.textContent = message || '';
    target.hidden = !message;
  }

  function setButtonBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
      return;
    }
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
    delete button.dataset.label;
  }

  function normalizeRules(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.versions)) return payload.versions;
    if (Array.isArray(payload?.rules)) return payload.rules;
    return [];
  }

  function ruleSource(rule) {
    if (rule.source) return String(rule.source).toLowerCase().startsWith('company') ? 'Company override' : 'Global default';
    return rule.company_id == null ? 'Global default' : 'Company override';
  }

  function ruleStatus(rule) {
    const supplied = String(rule.status || rule.effective_status || '').toLowerCase();
    if (['current', 'scheduled', 'expired', 'superseded', 'inactive'].includes(supplied)) return supplied;
    const today = todayKey();
    const start = dateKey(rule.effective_from);
    const end = dateKey(rule.effective_to);
    if (start && start > today) return 'scheduled';
    if (end && end < today) return 'expired';
    return 'current';
  }

  function currentRule(code) {
    const candidates = state.rules.filter((rule) => rule.code === code);
    const current = candidates
      .filter((rule) => ruleStatus(rule) === 'current')
      .sort((left, right) => {
        const sourceOrder = Number(right.company_id != null || right.source === 'company') - Number(left.company_id != null || left.source === 'company');
        return sourceOrder || dateKey(right.effective_from).localeCompare(dateKey(left.effective_from));
      });
    return current[0] || candidates.sort((left, right) => dateKey(right.effective_from).localeCompare(dateKey(left.effective_from)))[0];
  }

  function renderBracketRows(brackets = []) {
    const host = element('payroll-paye-brackets');
    const rows = brackets.length ? brackets : [{ lower_bound: 0, upper_bound: null, rate: 0 }];
    host.innerHTML = rows.map((bracket, index) => `
      <div class="payroll-bracket-row" data-bracket-row>
        <label class="payroll-bracket-field" data-label="From">
          <span class="sr-only">Bracket ${index + 1} lower amount</span>
          <input class="form-control" type="number" min="0" step="0.01" inputmode="decimal" data-bracket-field="lower" value="${safe(bracket.lower_bound ?? '')}" required>
        </label>
        <label class="payroll-bracket-field" data-label="To">
          <span class="sr-only">Bracket ${index + 1} upper amount</span>
          <input class="form-control" type="number" min="0" step="0.01" inputmode="decimal" data-bracket-field="upper" value="${safe(bracket.upper_bound ?? '')}" placeholder="No limit">
        </label>
        <label class="payroll-bracket-field payroll-bracket-field--rate" data-label="Rate">
          <span class="sr-only">Bracket ${index + 1} tax rate percentage</span>
          <input class="form-control" type="number" min="0" max="100" step="0.01" inputmode="decimal" data-bracket-field="rate" value="${safe(decimalRateToPercent(bracket.rate))}" required><span aria-hidden="true">%</span>
        </label>
        <button class="payroll-bracket-remove" type="button" data-remove-bracket="${index}" aria-label="Remove tax bracket ${index + 1}">&times;</button>
      </div>`).join('');
  }

  function captureBracketRows() {
    return [...document.querySelectorAll('[data-bracket-row]')].map((row) => ({
      lower_bound: row.querySelector('[data-bracket-field="lower"]').value,
      upper_bound: row.querySelector('[data-bracket-field="upper"]').value,
      rate_percent: row.querySelector('[data-bracket-field="rate"]').value
    }));
  }

  function validatedPayeBrackets() {
    const rows = captureBracketRows();
    if (!rows.length || rows.length > 20) throw new Error('Add between 1 and 20 PAYE brackets.');
    let previousUpper = null;
    return rows.map((row, index) => {
      const lower = Number(row.lower_bound);
      const upper = row.upper_bound === '' ? null : Number(row.upper_bound);
      const rate = Number(row.rate_percent);
      if (!Number.isFinite(lower) || lower < 0) throw new Error(`Bracket ${index + 1} needs a valid non-negative From amount.`);
      if (upper !== null && (!Number.isFinite(upper) || upper <= lower)) throw new Error(`Bracket ${index + 1} To amount must be greater than its From amount.`);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error(`Bracket ${index + 1} rate must be between 0% and 100%.`);
      if (index === 0 && lower !== 0) throw new Error('The first PAYE bracket must start at 0.');
      if (index > 0 && (previousUpper === null || Math.abs(lower - previousUpper) > 0.000001)) throw new Error(`Bracket ${index + 1} must start where the previous bracket ends.`);
      if (upper === null && index !== rows.length - 1) throw new Error('Only the final PAYE bracket can have no upper limit.');
      previousUpper = upper;
      return { lower_bound: lower, upper_bound: upper, rate: percentToDecimal(rate) };
    });
  }

  function addPayeBracket() {
    const rows = captureBracketRows();
    const previous = rows[rows.length - 1];
    rows.push({
      lower_bound: previous?.upper_bound || '',
      upper_bound: '',
      rate_percent: previous?.rate_percent || ''
    });
    renderBracketRows(rows.map((row) => ({
      lower_bound: row.lower_bound,
      upper_bound: row.upper_bound,
      rate: row.rate_percent === '' ? '' : Number(row.rate_percent) / 100
    })));
    element('payroll-paye-brackets').querySelector('[data-bracket-row]:last-child input')?.focus();
  }

  function removePayeBracket(index) {
    const rows = captureBracketRows();
    if (rows.length === 1) {
      showAlert('PAYE needs at least one tax bracket.');
      return;
    }
    rows.splice(index, 1);
    renderBracketRows(rows.map((row) => ({
      lower_bound: row.lower_bound,
      upper_bound: row.upper_bound,
      rate: row.rate_percent === '' ? '' : Number(row.rate_percent) / 100
    })));
  }

  function populateRuleForms() {
    const ssnit = currentRule('GH-SSNIT');
    const paye = currentRule('GH-PAYE');
    if (!element('payroll-ssnit-effective').value) element('payroll-ssnit-effective').value = todayKey();
    if (!element('payroll-paye-effective').value) element('payroll-paye-effective').value = todayKey();
    if (ssnit) {
      element('payroll-ssnit-employee').value = decimalRateToPercent(ssnit.employee_rate);
      element('payroll-ssnit-employer').value = decimalRateToPercent(ssnit.employer_rate);
      element('payroll-ssnit-ceiling').value = ssnit.maximum_amount ?? '';
      element('payroll-ssnit-source').textContent = ruleSource(ssnit);
    } else {
      element('payroll-ssnit-source').textContent = 'Not configured';
    }
    if (paye) {
      renderBracketRows(Array.isArray(paye.tax_brackets) ? paye.tax_brackets : []);
      element('payroll-paye-source').textContent = ruleSource(paye);
    } else {
      renderBracketRows();
      element('payroll-paye-source').textContent = 'Not configured';
    }
  }

  function describeRule(rule) {
    if (rule.code === 'GH-SSNIT') {
      return `${decimalRateToPercent(rule.employee_rate)}% employee · ${decimalRateToPercent(rule.employer_rate)}% employer · ${fmt.currency(rule.maximum_amount || 0)} ceiling`;
    }
    const brackets = Array.isArray(rule.tax_brackets) ? rule.tax_brackets.length : 0;
    return `${brackets} PAYE bracket${brackets === 1 ? '' : 's'}`;
  }

  function renderRuleHistory() {
    const host = element('payroll-rule-history');
    if (!state.rules.length) {
      host.innerHTML = '<div class="payroll-settings-empty">No statutory rule versions are available.</div>';
      return;
    }
    const ordered = [...state.rules].sort((left, right) => dateKey(right.effective_from).localeCompare(dateKey(left.effective_from)));
    host.innerHTML = ordered.map((rule) => {
      const status = ruleStatus(rule);
      const end = dateKey(rule.effective_to) ? ` to ${displayDate(rule.effective_to)}` : '';
      return `<article class="payroll-history-row">
        <div><strong>${safe(rule.name || rule.code)}</strong><span>${safe(rule.code)} · ${safe(ruleSource(rule))}</span></div>
        <div><strong>${safe(describeRule(rule))}</strong><span>Effective ${safe(displayDate(rule.effective_from))}${safe(end)}</span></div>
        <div><strong>${safe(rule.version || 'Version unavailable')}</strong><span>${safe(rule.change_reason || 'Statutory configuration')}</span></div>
        <span class="payroll-version-status payroll-version-status--${status}">${safe(status[0].toUpperCase() + status.slice(1))}</span>
      </article>`;
    }).join('');
  }

  async function loadRules(requestId = state.requestId) {
    const host = element('payroll-rule-history');
    host.innerHTML = '<div class="payroll-settings-loading">Loading rule history...</div>';
    try {
      const payload = await api.get('/payroll/settings/rules');
      if (requestId !== state.requestId) return;
      state.rules = normalizeRules(payload);
      populateRuleForms();
      renderRuleHistory();
    } catch (error) {
      if (requestId !== state.requestId) return;
      host.innerHTML = `<div class="payroll-settings-empty">${safe(error.message || 'Could not load payroll tax rules.')}</div>`;
      showAlert(error.message || 'Could not load payroll tax rules.');
    }
  }

  function staffHasSalary(staff) {
    return staff.id != null && staff.basic_salary != null;
  }

  function treatmentLabel(exempt) {
    const isExempt = exempt === true || exempt === 'true';
    return `<span class="payroll-treatment-status payroll-treatment-status--${isExempt ? 'exempt' : 'applied'}">${isExempt ? 'Exempt' : 'Applied'}</span>`;
  }

  function staffEffectiveDate(staff) {
    const effectiveFrom = dateKey(staff.effective_from);
    if (!effectiveFrom) return '—';
    const status = effectiveFrom > todayKey() ? 'Scheduled' : 'Current';
    return `<div class="payroll-effective-date"><span>${safe(displayDate(effectiveFrom))}</span><small>${status}</small></div>`;
  }

  function renderStaffRows() {
    const host = element('payroll-staff-rows');
    const term = element('payroll-staff-search').value.trim().toLowerCase();
    const rows = state.staff.filter((staff) => {
      const text = `${staff.first_name || ''} ${staff.last_name || ''} ${staff.employee_code || ''} ${staff.department_name || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
    if (!rows.length) {
      host.innerHTML = `<tr><td colspan="6"><div class="payroll-settings-empty">${term ? 'No staff match this search.' : 'No active staff records are available.'}</div></td></tr>`;
      return;
    }
    const compensationUrl = adminWorkspaceUrl('compensation');
    host.innerHTML = rows.map((staff) => {
      const name = `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || 'Unnamed staff member';
      const hasSalary = staffHasSalary(staff);
      return `<tr>
        <td><div class="payroll-staff-name"><strong>${safe(name)}</strong><span>${safe(staff.employee_code || 'No staff ID')} · ${safe(staff.department_name || 'No department')}</span></div></td>
        <td>${hasSalary ? treatmentLabel(staff.paye_exempt) : '—'}</td>
        <td>${hasSalary ? treatmentLabel(staff.ssnit_exempt) : '—'}</td>
        <td>${hasSalary ? safe(fmt.currency(staff.other_deductions || 0)) : 'Not set'}</td>
        <td>${hasSalary ? staffEffectiveDate(staff) : '—'}</td>
        <td>${hasSalary
          ? `<button class="btn btn-outline btn-sm" type="button" data-edit-staff="${Number(staff.employee_id)}">Review</button>`
          : `<a class="btn btn-outline btn-sm" href="${safe(compensationUrl)}" target="_top">Set salary</a>`}</td>
      </tr>`;
    }).join('');
  }

  async function loadStaff(requestId = state.requestId) {
    const host = element('payroll-staff-rows');
    host.innerHTML = '<tr><td colspan="6"><div class="payroll-settings-loading">Loading staff settings...</div></td></tr>';
    try {
      const staff = await api.get('/compensation?status=current');
      if (requestId !== state.requestId) return;
      state.staff = Array.isArray(staff) ? staff : [];
      renderStaffRows();
    } catch (error) {
      if (requestId !== state.requestId) return;
      host.innerHTML = `<tr><td colspan="6"><div class="payroll-settings-empty">${safe(error.message || 'Could not load staff tax settings.')}</div></td></tr>`;
    }
  }

  function openStaffEditor(employeeId) {
    const staff = state.staff.find((item) => Number(item.employee_id) === Number(employeeId));
    if (!staff || !staffHasSalary(staff)) return;
    state.activeStaff = staff;
    const name = `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || 'Staff member';
    element('payroll-staff-modal-title').textContent = `Edit ${name}`;
    element('payroll-staff-summary').innerHTML = `
      <div><strong>${safe(name)}</strong><span>${safe(staff.employee_code || 'No staff ID')} · ${safe(staff.job_title || staff.department_name || 'Staff member')}</span></div>
      <dl><dt>Basic salary</dt><dd>${safe(fmt.currency(staff.basic_salary || 0))}</dd></dl>
      <dl><dt>Allowances</dt><dd>${safe(fmt.currency(staff.allowances || 0))}</dd></dl>`;
    const earliest = addDateDays(staff.effective_from, 1);
    const effective = earliest > todayKey() ? earliest : todayKey();
    element('payroll-staff-effective').min = earliest;
    element('payroll-staff-effective').value = effective;
    element('payroll-staff-paye').checked = !(staff.paye_exempt === true || staff.paye_exempt === 'true');
    element('payroll-staff-ssnit').checked = !(staff.ssnit_exempt === true || staff.ssnit_exempt === 'true');
    element('payroll-staff-other-deduction').value = Number(staff.other_deductions || 0);
    element('payroll-staff-reason').value = '';
    showAlert('', element('payroll-staff-modal-alert'));
    element('payroll-staff-save-status').textContent = '';
    const modal = element('payroll-staff-modal');
    modal.style.display = 'flex';
    element('payroll-staff-effective').focus();
  }

  function closeStaffEditor() {
    element('payroll-staff-modal').style.display = 'none';
    state.activeStaff = null;
  }

  async function saveStaffSettings(event) {
    event.preventDefault();
    const staff = state.activeStaff;
    if (!staff) return;
    const form = element('payroll-staff-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const effectiveFrom = dateKey(element('payroll-staff-effective').value);
    const otherDeductions = Number(element('payroll-staff-other-deduction').value || 0);
    const changeReason = element('payroll-staff-reason').value.trim();
    if (!effectiveFrom || effectiveFrom <= dateKey(staff.effective_from)) {
      showAlert('Choose an effective date after the current salary record started.', element('payroll-staff-modal-alert'));
      return;
    }
    if (!Number.isFinite(otherDeductions) || otherDeductions < 0) {
      showAlert('Enter a valid non-negative monthly deduction.', element('payroll-staff-modal-alert'));
      return;
    }
    if (otherDeductions > Number(staff.basic_salary || 0) + Number(staff.allowances || 0)) {
      showAlert('The monthly deduction cannot exceed this staff member\'s gross salary.', element('payroll-staff-modal-alert'));
      return;
    }
    if (!changeReason) {
      showAlert('Enter a reason for this staff payroll change.', element('payroll-staff-modal-alert'));
      return;
    }
    const button = element('payroll-staff-save');
    setButtonBusy(button, true, 'Scheduling...');
    showAlert('', element('payroll-staff-modal-alert'));
    try {
      await api.post('/compensation', {
        employee_id: Number(staff.employee_id),
        basic_salary: Number(staff.basic_salary || 0),
        allowances: Number(staff.allowances || 0),
        ssnit_insurable_salary: Number(staff.ssnit_insurable_salary ?? staff.basic_salary ?? 0),
        other_deductions: otherDeductions,
        effective_from: effectiveFrom,
        paye_exempt: !element('payroll-staff-paye').checked,
        ssnit_exempt: !element('payroll-staff-ssnit').checked,
        change_reason: changeReason
      });
      toast('Staff tax and deduction settings scheduled', 'success');
      closeStaffEditor();
      await loadStaff(state.requestId);
    } catch (error) {
      showAlert(error.message || 'Could not schedule staff payroll settings.', element('payroll-staff-modal-alert'));
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function saveSsnitSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const effectiveFrom = dateKey(element('payroll-ssnit-effective').value);
    const employeeRate = Number(element('payroll-ssnit-employee').value);
    const employerRate = Number(element('payroll-ssnit-employer').value);
    const ceiling = Number(element('payroll-ssnit-ceiling').value);
    const reason = element('payroll-ssnit-reason').value.trim();
    if (!effectiveFrom || !Number.isFinite(employeeRate) || employeeRate <= 0 || employeeRate > 100 || !Number.isFinite(employerRate) || employerRate <= 0 || employerRate > 100 || !Number.isFinite(ceiling) || ceiling <= 0) {
      showAlert('Enter a valid effective date, contribution rates between 0% and 100%, and a positive SSNIT ceiling.');
      return;
    }
    if (!window.confirm(`Schedule this SSNIT version from ${displayDate(effectiveFrom)}?`)) return;
    const button = element('payroll-ssnit-save');
    setButtonBusy(button, true, 'Scheduling...');
    element('payroll-ssnit-status').textContent = '';
    showAlert('');
    try {
      await api.post('/payroll/settings/rules/GH-SSNIT', {
        effective_from: effectiveFrom,
        employee_rate: percentToDecimal(employeeRate),
        employer_rate: percentToDecimal(employerRate),
        maximum_amount: ceiling,
        change_reason: reason
      });
      element('payroll-ssnit-reason').value = '';
      element('payroll-ssnit-status').textContent = 'Version scheduled';
      toast('SSNIT rule scheduled', 'success');
      await loadRules(state.requestId);
    } catch (error) {
      showAlert(error.message || 'Could not schedule the SSNIT rule.');
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function savePayeSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    let brackets;
    try {
      brackets = validatedPayeBrackets();
    } catch (error) {
      showAlert(error.message);
      return;
    }
    const effectiveFrom = dateKey(element('payroll-paye-effective').value);
    const reason = element('payroll-paye-reason').value.trim();
    if (!effectiveFrom || !reason) {
      showAlert('Choose the PAYE effective date and enter a reason for the change.');
      return;
    }
    if (!window.confirm(`Schedule these PAYE brackets from ${displayDate(effectiveFrom)}?`)) return;
    const button = element('payroll-paye-save');
    setButtonBusy(button, true, 'Scheduling...');
    element('payroll-paye-status').textContent = '';
    showAlert('');
    try {
      await api.post('/payroll/settings/rules/GH-PAYE', {
        effective_from: effectiveFrom,
        tax_brackets: brackets,
        change_reason: reason
      });
      element('payroll-paye-reason').value = '';
      element('payroll-paye-status').textContent = 'Version scheduled';
      toast('PAYE rule scheduled', 'success');
      await loadRules(state.requestId);
    } catch (error) {
      showAlert(error.message || 'Could not schedule the PAYE rule.');
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function loadPayrollSettingsPage() {
    const requestId = ++state.requestId;
    showAlert('');
    await Promise.all([loadRules(requestId), loadStaff(requestId)]);
    state.loaded = true;
  }

  function bindPayrollSettingsPage() {
    element('payroll-ssnit-form')?.addEventListener('submit', saveSsnitSettings);
    element('payroll-paye-form')?.addEventListener('submit', savePayeSettings);
    element('payroll-add-bracket')?.addEventListener('click', addPayeBracket);
    element('payroll-paye-brackets')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-bracket]');
      if (button) removePayeBracket(Number(button.dataset.removeBracket));
    });
    element('payroll-rules-refresh')?.addEventListener('click', () => loadRules(state.requestId));
    element('payroll-staff-search')?.addEventListener('input', renderStaffRows);
    element('payroll-staff-rows')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-staff]');
      if (button) openStaffEditor(button.dataset.editStaff);
    });
    element('payroll-staff-form')?.addEventListener('submit', saveStaffSettings);
    element('payroll-staff-modal-close')?.addEventListener('click', closeStaffEditor);
    element('payroll-staff-modal-cancel')?.addEventListener('click', closeStaffEditor);
    element('payroll-staff-modal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeStaffEditor();
    });
  }

  bindPayrollSettingsPage();
  window.payrollSettingsPage = { load: loadPayrollSettingsPage };
})();
