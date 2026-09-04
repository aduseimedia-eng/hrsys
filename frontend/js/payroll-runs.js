const payrollRunUser = requireRole('admin');
if (!payrollRunUser) throw new Error('redirect');
buildSidebar('payroll-runs');

const payrollRunActions = {
  draft: ['Calculate', 'calculate'],
  calculated: ['Submit', 'submit'],
  pending_approval: ['Approve', 'approve'],
  approved: ['Finalize', 'finalize'],
  finalized: ['Mark paid', 'mark_paid']
};
let payrollRunsRequest = 0;
let payrollRunSetupLoading = false;

function escapePayrollRun(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function payrollDateKey(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatPayrollRunDate(value) {
  const key = payrollDateKey(value);
  if (!key) return '\u2014';
  const [year, month, day] = key.split('-');
  const format = String(api.getCompanyPreferences?.()?.date_format || 'DD/MM/YYYY').toUpperCase();
  if (format === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  if (format === 'YYYY-MM-DD') return key;
  return `${day}/${month}/${year}`;
}

function payrollRunDateHtml(value) {
  const key = payrollDateKey(value);
  return key
    ? `<time datetime="${key}">${formatPayrollRunDate(key)}</time>`
    : '\u2014';
}

function payrollDateKeyFromParts(year, monthIndex, day) {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validPayrollTimeZone(value) {
  const timeZone = String(value || '').trim();
  if (!timeZone) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return timeZone;
  } catch (_) {
    return '';
  }
}

function currentPayrollRunPeriod(reference = new Date(), timeZone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone: validPayrollTimeZone(timeZone) || 'UTC',
    year: 'numeric',
    month: '2-digit'
  });
  const values = Object.fromEntries(
    formatter.formatToParts(reference).map(({ type, value }) => [type, value])
  );
  const year = Number(values.year);
  const monthIndex = Number(values.month) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    start: payrollDateKeyFromParts(year, monthIndex, 1),
    end: payrollDateKeyFromParts(year, monthIndex, lastDay)
  };
}

function renderPayrollRun(run) {
  const action = payrollRunActions[run.status];
  const start = payrollRunDateHtml(run.period_start);
  const end = payrollRunDateHtml(run.period_end);
  const paymentDate = payrollDateKey(run.payment_date)
    ? `<small class="run-payment-date">Payment date: ${payrollRunDateHtml(run.payment_date)}</small>`
    : '';
  return `
    <tr>
      <td>
        <strong class="run-period">${start}<span class="sr-only"> to </span><span aria-hidden="true"> &ndash; </span>${end}</strong>
        ${paymentDate}
      </td>
      <td>${escapePayrollRun(run.pay_group_name || 'Unassigned')}</td>
      <td>${escapePayrollRun(run.country_code || '\u2014')}</td>
      <td>${fmt.statusBadge(String(run.status || '').replaceAll('_', ' '))}</td>
      <td>
        ${action
          ? `<button class="btn btn-primary btn-sm" type="button" onclick="advanceRun(${Number(run.id)}, '${action[1]}')">${action[0]}</button>`
          : '<span class="run-complete">Complete</span>'}
      </td>
    </tr>`;
}

async function loadRuns() {
  const requestId = ++payrollRunsRequest;
  const host = document.getElementById('run-rows');
  host.innerHTML = '<tr><td colspan="5"><div class="loading-state"><div class="spinner"></div></div></td></tr>';
  try {
    const runs = await api.get('/payroll/runs');
    if (requestId !== payrollRunsRequest) return;
    host.innerHTML = runs.length
      ? runs.map(renderPayrollRun).join('')
      : '<tr><td colspan="5"><div class="empty-state"><p>No payroll runs yet.</p></div></td></tr>';
  } catch (error) {
    if (requestId !== payrollRunsRequest) return;
    host.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>${escapePayrollRun(error.message || 'Could not load payroll runs.')}</p></div></td></tr>`;
  }
}

async function showCreateRunModal() {
  if (payrollRunSetupLoading) return;
  const existing = document.getElementById('create-payroll-run-modal');
  if (existing) return;
  payrollRunSetupLoading = true;
  try {
    const setup = await api.get('/payroll/setup');
    const group = setup.pay_groups?.[0];
    if (!group) throw new Error('No active pay group is available');
    const entity = setup.legal_entities?.find(
      (item) => String(item.id) === String(group.legal_entity_id)
    );
    const country = setup.countries?.find(
      (item) => item.iso_code === group.country_code
    );
    const timeZone = validPayrollTimeZone(entity?.timezone)
      || validPayrollTimeZone(country?.default_timezone)
      || 'UTC';
    const { start, end } = currentPayrollRunPeriod(new Date(), timeZone);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'create-payroll-run-modal';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="create-payroll-run-title" style="max-width:520px">
        <div class="modal-header">
          <h3 id="create-payroll-run-title">Create payroll run</h3>
          <button class="modal-close" type="button" aria-label="Close create payroll run" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="run-dialog-note">This creates a draft only. You will review it before calculation.</div>
          <div class="run-dialog-summary">
            <div><span>Pay group</span><strong>${escapePayrollRun(group.name)}</strong></div>
            <div><span>Period</span><strong>${payrollRunDateHtml(start)}<span class="sr-only"> to </span><span aria-hidden="true"> &ndash; </span>${payrollRunDateHtml(end)}</strong></div>
            <div><span>Payment date</span><strong>${payrollRunDateHtml(end)}</strong></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" type="button" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" type="button" onclick="confirmCreateRun(this, ${Number(group.id)}, '${start}', '${end}')">Create draft</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } catch (error) {
    toast(error.message || 'Could not create payroll run', 'error');
  } finally {
    payrollRunSetupLoading = false;
  }
}

async function confirmCreateRun(button, groupId, start, end) {
  const startKey = payrollDateKey(start);
  const endKey = payrollDateKey(end);
  if (!startKey || !endKey || endKey < startKey) {
    toast('Choose a valid payroll period', 'error');
    return;
  }
  try {
    button.disabled = true;
    button.textContent = 'Creating...';
    await api.post('/payroll/runs', {
      pay_group_id: groupId,
      period_start: start,
      period_end: end,
      payment_date: end
    });
    button.closest('.modal-overlay').remove();
    toast('Draft payroll run created', 'success');
    await loadRuns();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Create draft';
    toast(error.message || 'Could not create payroll run', 'error');
  }
}

function advanceRun(id, action) {
  const configuredAction = Object.values(payrollRunActions).find((entry) => entry[1] === action);
  if (!configuredAction) {
    toast('This payroll action is not available', 'error');
    return;
  }
  document.getElementById('payroll-run-action-modal')?.remove();
  const [label] = configuredAction;
  const note = action === 'finalize'
    ? 'Finalized outputs are locked.'
    : 'This action changes the payroll run stage.';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'payroll-run-action-modal';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="payroll-run-action-title" style="max-width:480px">
      <div class="modal-header">
        <h3 id="payroll-run-action-title">${label} payroll run</h3>
        <button class="modal-close" type="button" aria-label="Close payroll run action" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body"><div class="run-dialog-note">${note}</div></div>
      <div class="modal-footer">
        <button class="btn btn-outline" type="button" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" type="button" onclick="confirmRunAction(this, ${Number(id)}, '${action}')">${label}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function confirmRunAction(button, id, action) {
  try {
    button.disabled = true;
    button.textContent = 'Saving...';
    if (action === 'calculate') await api.post(`/payroll/runs/${id}/calculate`);
    else await api.post(`/payroll/runs/${id}/transition`, { action });
    button.closest('.modal-overlay').remove();
    toast('Payroll run updated', 'success');
    await loadRuns();
  } catch (error) {
    button.disabled = false;
    button.textContent = payrollRunActions[Object.keys(payrollRunActions).find((key) => payrollRunActions[key][1] === action)]?.[0] || 'Try again';
    toast(error.message || 'Could not update payroll run', 'error');
  }
}

loadRuns();
