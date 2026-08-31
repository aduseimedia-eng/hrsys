const user = requireAuth();
if (!user) throw new Error('redirect');
buildSidebar('payroll');
loadNotifCount();

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();
const payrollTrendCharts = {};

if (user.role === 'admin') {
  document.getElementById('admin-tab').style.display = '';
  document.getElementById('summary-tab').style.display = '';

  document.getElementById('admin-payroll-actions').innerHTML =
    `<button class="btn btn-outline" onclick="downloadAllPayslips()">Download All PDF</button>
     <button class="btn btn-outline" onclick="showOvertimeRateModal()">Overtime Rate</button>
     <button class="btn btn-outline" onclick="location.href=appUrl('/pages/payroll-runs.html')">Payroll Runs</button>
     <button class="btn btn-primary" onclick="showProcessModal()">Process Payroll</button>`;

  const mSel = document.getElementById('pr-month');
  const ySel = document.getElementById('pr-year');
  months.forEach((m, i) => mSel.innerHTML += `<option value="${i+1}" ${i===now.getMonth()?'selected':''}>${m}</option>`);
  for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
    ySel.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
  }
  loadPayrollDashboard();
}

async function loadPayrollDashboard() {
  const dashboard = document.getElementById('payroll-dashboard');
  if (!dashboard || user.role !== 'admin') return;
  dashboard.style.display = 'grid';
  try {
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const [summary, rows] = await Promise.all([
      api.get('/payroll/summary'),
      api.get(`/payroll?month=${month}&year=${year}`)
    ]);
    const gross = rows.reduce((total, row) => total + Number(row.base_salary || 0) + Number(row.allowances || 0) + Number(row.overtime_pay || 0), 0);
    const deductions = rows.reduce((total, row) => total + Number(row.deductions || 0), 0);
    const net = rows.reduce((total, row) => total + Number(row.net_salary || 0), 0);
    const statusCount = (status) => rows.filter((row) => row.status === status).length;
    document.getElementById('payroll-kpis').innerHTML = [
      ['Net payroll', fmt.currency(net), `${rows.length} payslips`],
      ['Gross pay', fmt.currency(gross), `${months[month - 1]} ${year}`],
      ['Deductions', fmt.currency(deductions), 'Current period'],
      ['Paid payslips', String(statusCount('paid')), `${rows.length ? Math.round((statusCount('paid') / rows.length) * 100) : 0}% complete`]
    ].map(([label, value, detail]) => `<article class="payroll-kpi"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    document.getElementById('payroll-pipeline').innerHTML = [
      ['Pending', statusCount('pending'), 'draft'],
      ['Processed', statusCount('processed'), 'review'],
      ['Paid', statusCount('paid'), 'paid']
    ].map(([label, value, style]) => `<div class="payroll-stage ${style}"><strong>${value}</strong><span>${label}</span></div>`).join('');
    renderPayrollTrend('payroll-dashboard-trend', summary.slice().reverse());
    const departments = rows.reduce((grouped, row) => {
      const name = row.department_name || 'Unassigned';
      grouped[name] = (grouped[name] || 0) + Number(row.net_salary || 0);
      return grouped;
    }, {});
    KenadCharts.doughnut('#payroll-department-chart', Object.keys(departments), Object.values(departments));
    const deductionParts = {
      Tax: rows.reduce((total, row) => total + Number(row.tax || 0), 0),
      SSNIT: rows.reduce((total, row) => total + Number(row.ssnit_employee || 0), 0),
      Other: rows.reduce((total, row) => total + Number(row.other_deductions || 0) + Number(row.loan_deductions || 0) + Number(row.benefit_deductions || 0), 0)
    };
    KenadCharts.doughnut('#payroll-deduction-chart', Object.keys(deductionParts), Object.values(deductionParts));
    const topEarners = rows.slice().sort((a, b) => Number(b.net_salary || 0) - Number(a.net_salary || 0)).slice(0, 6);
    document.getElementById('payroll-top-earners').innerHTML = topEarners.length ? topEarners.map((row) => `<div class="payroll-person"><div><strong>${row.employee_name || 'Employee'}</strong><small>${row.department_name || 'No department'}</small></div><b>${fmt.currency(row.net_salary)}</b></div>`).join('') : '<div class="empty-state"><p>No payroll for this period.</p></div>';
    document.getElementById('payroll-glance').innerHTML = [
      ['Employees paid', `${statusCount('paid')} of ${rows.length}`],
      ['Pending review', String(statusCount('pending') + statusCount('processed'))],
      ['Average net pay', fmt.currency(rows.length ? net / rows.length : 0)]
    ].map(([label, value]) => `<div class="payroll-person"><div><strong>${label}</strong></div><b>${value}</b></div>`).join('');
  } catch (error) {
    dashboard.innerHTML = `<div class="empty-state"><p>${error.message || 'Could not load payroll dashboard.'}</p></div>`;
  }
}

function renderPayrollTrend(hostId, rows) {
  const host = document.getElementById(hostId);
  if (!host) return;
  if (!window.Chart) {
    KenadCharts.line(host, rows.map((row) => `${months[Number(row.month) - 1].slice(0, 3)} ${String(row.year).slice(-2)}`), rows.map((row) => Number(row.total_net || 0)), '#2563eb');
    return;
  }
  payrollTrendCharts[hostId]?.destroy();
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  payrollTrendCharts[hostId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map((row) => `${months[Number(row.month) - 1].slice(0, 3)} ${String(row.year).slice(-2)}`),
      datasets: [
        { label: 'Gross', data: rows.map((row) => Number(row.total_gross || row.total_base || 0)), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.10)', fill: true },
        { label: 'Deductions', data: rows.map((row) => Number(row.total_deductions || 0)), borderColor: '#ef4444', backgroundColor: 'transparent', fill: false },
        { label: 'Net', data: rows.map((row) => Number(row.total_net || 0)), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.07)', fill: true }
      ].map((dataset) => ({ ...dataset, borderWidth: 2.5, tension: .35, pointRadius: 3, pointHoverRadius: 5, pointBorderWidth: 2, pointBorderColor: '#fff' }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 14, color: '#64748b', font: { size: 11, weight: '600' } } },
        tooltip: { backgroundColor: '#17243d', padding: 10, cornerRadius: 8, callbacks: { label: (item) => `${item.dataset.label}: ${fmt.currency(item.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8190a8', font: { size: 10 } } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: '#e9eef6', drawTicks: false }, ticks: { color: '#8190a8', font: { size: 10 }, callback: (value) => fmt.currency(value) } }
      }
    }
  });
}

function switchTab(tab) {
  const tabs = ['mine', 'all', 'summary'];
  tabs.forEach(t => document.getElementById(`tab-${t}`).style.display = t===tab?'':'none');
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', tabs[i]===tab));
  if (tab==='all') loadAllPayroll();
  if (tab==='summary') loadSummary();
}

const payrollRunActions = {
  draft: ['Calculate', 'calculate'], calculated: ['Submit', 'submit'],
  pending_approval: ['Approve', 'approve'], approved: ['Finalize', 'finalize'],
  finalized: ['Mark paid', 'mark_paid']
};

function runPeriod(run) {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(`${run.period_start}T00:00:00`).toLocaleDateString(undefined, options)} – ${new Date(`${run.period_end}T00:00:00`).toLocaleDateString(undefined, options)}`;
}

async function loadPayrollRuns() {
  const body = document.getElementById('payroll-runs-tbody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="6"><div class="loading-state"><div class="spinner"></div></div></td></tr>';
  try {
    const runs = await api.get('/payroll/runs');
    body.innerHTML = runs.length ? runs.map((run) => {
      const action = payrollRunActions[run.status];
      return `<tr><td><strong>${runPeriod(run)}</strong></td><td>${safe(run.pay_group_name || '—')}</td><td>${safe(run.country_code || '—')}</td><td>${safe(run.currency_code || '—')}</td><td>${fmt.statusBadge(String(run.status).replace('_', ' '))}</td><td><div class="payroll-run-actions">${action ? `<button class="btn btn-primary btn-sm" onclick="advancePayrollRun(${run.id}, '${action[1]}')">${action[0]}</button>` : '<span class="payroll-run-meta">Complete</span>'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="6"><div class="empty-state"><p>No global payroll runs yet. Create one to calculate payroll with Ghana rules.</p></div></td></tr>';
  } catch (error) { body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>${safe(error.message || 'Could not load payroll runs.')}</p></div></td></tr>`; }
}

async function showCreatePayrollRun() {
  try {
    const setup = await api.get('/payroll/setup');
    if (!setup.pay_groups?.length) return toast('No active pay group is available.', 'warning');
    const today = new Date(), start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="max-width:540px"><div class="modal-header"><h3>Create global payroll run</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button></div><div class="modal-body"><p style="margin:0 0 18px;color:var(--text-secondary);font-size:.88rem">Create a draft, then calculate it using the effective country rules.</p><div class="form-group"><label class="form-label">Pay group</label><select id="global-run-pay-group" class="form-control form-select">${setup.pay_groups.map(group => `<option value="${group.id}">${safe(group.name)} · ${safe(group.country_code)} · ${safe(group.pay_frequency)}</option>`).join('')}</select></div><div class="form-grid"><div class="form-group"><label class="form-label">Period start</label><input id="global-run-start" class="form-control" type="date" value="${start}"></div><div class="form-group"><label class="form-label">Period end</label><input id="global-run-end" class="form-control" type="date" value="${end}"></div></div><div class="form-group"><label class="form-label">Payment date</label><input id="global-run-payment" class="form-control" type="date" value="${end}"></div></div><div class="modal-footer"><button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button><button class="btn btn-primary" onclick="createPayrollRun(this)">Create draft</button></div></div>`;
    document.body.appendChild(overlay);
  } catch (error) { toast(error.message || 'Could not load payroll setup', 'error'); }
}

async function createPayrollRun(button) {
  try {
    button.disabled = true;
    await api.post('/payroll/runs', { pay_group_id: Number(document.getElementById('global-run-pay-group').value), period_start: document.getElementById('global-run-start').value, period_end: document.getElementById('global-run-end').value, payment_date: document.getElementById('global-run-payment').value || null });
    button.closest('.modal-overlay').remove(); toast('Draft payroll run created. Select Calculate when ready.', 'success'); loadPayrollRuns();
  } catch (error) { button.disabled = false; toast(error.message || 'Could not create payroll run', 'error'); }
}

async function advancePayrollRun(id, action) {
  const labels = { calculate: 'Calculate', submit: 'Submit', approve: 'Approve', finalize: 'Finalize', mark_paid: 'Mark paid' };
  if (!confirm(`${labels[action]} this payroll run?`)) return;
  try {
    if (action === 'calculate') await api.post(`/payroll/runs/${id}/calculate`);
    else await api.post(`/payroll/runs/${id}/transition`, { action });
    const completed = { calculate: 'calculated', submit: 'submitted', approve: 'approved', finalize: 'finalized', mark_paid: 'marked as paid' };
    toast(`Payroll run ${completed[action]}.`, 'success'); loadPayrollRuns();
  } catch (error) { toast(error.message || `Could not ${action} payroll run`, 'error'); }
}

async function loadMyPayslips() {
  const slips = await api.get('/payroll/mine');
  const grid = document.getElementById('my-payslips-grid');
  if (!slips.length) { grid.innerHTML = `<div class="empty-state"><p>No payslips available yet</p></div>`; return; }

  grid.innerHTML = slips.map(s => {
    const monthName = months[s.month - 1];
    return `<div class="payslip-card" onclick="viewPayslip(${s.id})">
      <div class="payslip-header">
        <div class="payslip-month">${monthName} ${s.year}</div>
        <div style="margin-top:4px">${fmt.statusBadge(s.status)}</div>
      </div>
      <div class="payslip-body">
        <div class="payslip-row"><span style="color:var(--text-muted)">Base Salary</span><span>${fmt.currency(s.base_salary)}</span></div>
        <div class="payslip-row"><span style="color:var(--text-muted)">Allowances</span><span style="color:var(--success-fg)">+${fmt.currency(s.allowances)}</span></div>
        ${Number(s.overtime_pay || 0) ? `<div class="payslip-row"><span style="color:var(--text-muted)">Overtime (${Number(s.overtime_hours || 0).toFixed(2)} h)</span><span style="color:var(--success-fg)">+${fmt.currency(s.overtime_pay)}</span></div>` : ''}
        <div class="payslip-row"><span style="color:var(--text-muted)">Deductions</span><span style="color:var(--danger-fg)">-${fmt.currency(s.deductions)}</span></div>
        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.8rem;color:var(--text-muted)">Net Pay</span>
          <span class="payslip-net">${fmt.currency(s.net_salary)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function pensionBreakdownHtml(s) {
  const tier1 = Number(s.pension_tier1 || 0);
  const tier2 = Number(s.pension_tier2 || 0);
  if (!tier1 && !tier2) return '';
  const pensionable = Number(s.pensionable_earnings || s.base_salary || 0);
  const employeeTier1 = Number(s.ssnit_employee || 0);
  const employerTier1 = Math.max(0, tier1 - employeeTier1);
  const employerPension = Number(s.ssnit_employer || employerTier1 + tier2);
  const totalStatutoryPension = tier1 + tier2;
  return `
    <div class="detail-section">
      <h4>Pension Contributions</h4>
      <div class="detail-row"><span>Pensionable earnings</span><span>${fmt.currency(pensionable)}</span></div>
      <div class="detail-row"><span>Tier 1 — SSNIT, employee (5.5%)</span><span class="negative">-${fmt.currency(employeeTier1)}</span></div>
      <div class="detail-row"><span>Tier 1 — SSNIT, employer (8%)</span><span>${fmt.currency(employerTier1)}</span></div>
      <div class="detail-row"><span>Tier 2 — Occupational pension, employer (5%)</span><span>${fmt.currency(tier2)}</span></div>
      <div class="detail-row"><span>Total statutory pension contribution</span><span>${fmt.currency(totalStatutoryPension)}</span></div>
      <div class="detail-row total"><span>Total employer pension cost</span><span>${fmt.currency(employerPension)}</span></div>
    </div>`;
}

async function viewPayslip(id) {
  const s = await api.get(`/payroll/${id}`);
  const monthName = months[s.month - 1];
  document.getElementById('payslip-detail').innerHTML = `
    <div class="payslip-detail" id="printable-payslip">
      <div class="payslip-detail-header">
        <div class="company-logo">
          <div class="mark">HR</div>
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.1rem">KenadHR</div>
            <div style="font-size:.8rem;color:var(--text-muted)">Payroll Department</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:600">${monthName} ${s.year}</div>
          <div style="font-size:.8rem;color:var(--text-muted)">Payslip</div>
          ${fmt.statusBadge(s.status)}
        </div>
      </div>

      <div class="detail-section">
        <h4>Employee Details</h4>
        <div class="detail-row"><span>Name</span><span>${s.first_name} ${s.last_name}</span></div>
        <div class="detail-row"><span>Job Title</span><span>${s.job_title || '-'}</span></div>
        <div class="detail-row"><span>Department</span><span>${s.department_name || '-'}</span></div>
        <div class="detail-row"><span>Email</span><span>${s.email}</span></div>
      </div>

      <div class="detail-section">
        <h4>Earnings</h4>
        <div class="detail-row"><span>Base Salary</span><span class="positive">${fmt.currency(s.base_salary)}</span></div>
        <div class="detail-row"><span>Allowances</span><span class="positive">+${fmt.currency(s.allowances)}</span></div>
        <div class="detail-row"><span>Overtime (${Number(s.overtime_hours || 0).toFixed(2)} h)</span><span class="positive">+${fmt.currency(s.overtime_pay || 0)}</span></div>
        <div class="detail-row total"><span>Gross Pay</span><span>${fmt.currency(parseFloat(s.base_salary)+parseFloat(s.allowances)+parseFloat(s.overtime_pay || 0))}</span></div>
      </div>

      <div class="detail-section">
        <h4>Deductions</h4>
        <div class="detail-row"><span>Tax</span><span class="negative">-${fmt.currency(s.tax ?? s.deductions)}</span></div>
        <div class="detail-row"><span>SSNIT (employee)</span><span class="negative">-${fmt.currency(s.ssnit_employee || 0)}</span></div>
        <div class="detail-row"><span>Benefits contribution</span><span class="negative">-${fmt.currency(s.benefit_deductions || 0)}</span></div>
        <div class="detail-row"><span>Loan repayment</span><span class="negative">-${fmt.currency(s.loan_deductions || 0)}</span></div>
        <div class="detail-row"><span>Other deductions</span><span class="negative">-${fmt.currency(s.other_deductions || 0)}</span></div>
        <div class="detail-row total"><span>Total deductions</span><span class="negative">-${fmt.currency(s.deductions)}</span></div>
      </div>

      ${pensionBreakdownHtml(s)}
      <div class="net-salary-box">
        <div>
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:4px">NET PAY</div>
          <div class="net-amount">${fmt.currency(s.net_salary)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.8rem;color:var(--text-muted)">Payment Status</div>
          <div style="margin-top:4px">${fmt.statusBadge(s.status)}</div>
          ${s.paid_at ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">Paid ${fmt.date(s.paid_at)}</div>` : ''}
        </div>
      </div>
    </div>`;
  document.getElementById('payslip-modal').style.display = 'flex';
  window.dispatchEvent(new Event('hrconnect:request-page-height'));
}

function closePayslipModal() {
  document.getElementById('payslip-modal').style.display = 'none';
  window.dispatchEvent(new Event('hrconnect:request-page-height'));
}

function printPayslip() {
  const printable = document.getElementById('printable-payslip');
  if (!printable) {
    toast('Open a payslip before printing.', 'warning');
    return;
  }

  const w = window.open('', '_blank');
  if (!w) {
    toast('Allow popups to print this payslip.', 'warning');
    return;
  }

  const doc = w.document;
  doc.title = 'Payslip';

  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../css/main.css';
  doc.head.appendChild(link);

  const style = doc.createElement('style');
  style.textContent = 'body{padding:40px;background:#fff}.payslip-detail{max-width:100%;padding:0}@media print{body{padding:0}}';
  doc.head.appendChild(style);

  doc.body.innerHTML = printable.innerHTML;
  w.focus();
  setTimeout(() => w.print(), 250);
}

function payslipHtml(s) {
  const monthName = months[s.month - 1];
  const gross = Number(s.base_salary || 0) + Number(s.allowances || 0) + Number(s.overtime_pay || 0);
  return `
    <section class="payslip-detail printable-slip">
      <div class="payslip-detail-header">
        <div class="company-logo">
          <div class="mark">HR</div>
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.1rem">KenadHR</div>
            <div style="font-size:.8rem;color:var(--text-muted)">Payroll Department</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:600">${monthName} ${s.year}</div>
          <div style="font-size:.8rem;color:var(--text-muted)">Payslip</div>
          ${fmt.statusBadge(s.status)}
        </div>
      </div>
      <div class="detail-section">
        <h4>Employee Details</h4>
        <div class="detail-row"><span>Name</span><span>${safe(s.first_name || s.employee_name?.split(' ')[0] || '')} ${safe(s.last_name || s.employee_name?.split(' ').slice(1).join(' ') || '')}</span></div>
        <div class="detail-row"><span>Employment Type</span><span>${payrollTypeLabel(s)}</span></div>
        <div class="detail-row"><span>Job Title</span><span>${safe(s.job_title || '-')}</span></div>
        <div class="detail-row"><span>Department</span><span>${safe(s.department_name || '-')}</span></div>
        ${s.email ? `<div class="detail-row"><span>Email</span><span>${safe(s.email)}</span></div>` : ''}
      </div>
      <div class="detail-section">
        <h4>Earnings</h4>
        <div class="detail-row"><span>Base Salary</span><span class="positive">${fmt.currency(s.base_salary)}</span></div>
        <div class="detail-row"><span>Allowances</span><span class="positive">+${fmt.currency(s.allowances)}</span></div>
        <div class="detail-row"><span>Overtime (${Number(s.overtime_hours || 0).toFixed(2)} h)</span><span class="positive">+${fmt.currency(s.overtime_pay || 0)}</span></div>
        <div class="detail-row total"><span>Gross Pay</span><span>${fmt.currency(gross)}</span></div>
      </div>
      <div class="detail-section">
        <h4>Deductions</h4>
        <div class="detail-row"><span>Tax</span><span class="negative">-${fmt.currency(s.tax ?? s.deductions)}</span></div>
        <div class="detail-row"><span>SSNIT (employee)</span><span class="negative">-${fmt.currency(s.ssnit_employee || 0)}</span></div>
        <div class="detail-row"><span>Benefits contribution</span><span class="negative">-${fmt.currency(s.benefit_deductions || 0)}</span></div>
        <div class="detail-row"><span>Loan repayment</span><span class="negative">-${fmt.currency(s.loan_deductions || 0)}</span></div>
        <div class="detail-row"><span>Other deductions</span><span class="negative">-${fmt.currency(s.other_deductions || 0)}</span></div>
        <div class="detail-row total"><span>Total deductions</span><span class="negative">-${fmt.currency(s.deductions)}</span></div>
      </div>
      ${pensionBreakdownHtml(s)}
      <div class="net-salary-box">
        <div>
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:4px">NET PAY</div>
          <div class="net-amount">${fmt.currency(s.net_salary)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.8rem;color:var(--text-muted)">Payment Status</div>
          <div style="margin-top:4px">${fmt.statusBadge(s.status)}</div>
          ${s.paid_at ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">Paid ${fmt.date(s.paid_at)}</div>` : ''}
        </div>
      </div>
    </section>`;
}

async function downloadAllPayslips() {
  try {
    const month = document.getElementById('pr-month').value;
    const year = document.getElementById('pr-year').value;
    const rows = await api.get(`/payroll?month=${month}&year=${year}`);
    if (!rows.length) {
      toast('No payslips for this period.', 'warning');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      toast('Allow popups to download payslips.', 'warning');
      return;
    }
    w.document.title = `Payslips ${months[month - 1]} ${year}`;
    w.document.head.innerHTML = `
      <link rel="stylesheet" href="../css/main.css">
      <style>
        body{padding:28px;background:#fff}
        .payslip-detail{max-width:100%;margin:0 auto 30px;padding:0}
        .printable-slip{break-after:page;page-break-after:always}
        .printable-slip:last-child{break-after:auto;page-break-after:auto}
        @media print{body{padding:0}.printable-slip{min-height:96vh}}
      </style>`;
    w.document.body.innerHTML = rows.map((row) => payslipHtml(row)).join('');
    w.focus();
    setTimeout(() => w.print(), 350);
  } catch (e) {
    toast(e.message || 'Could not prepare payslips', 'error');
  }
}

async function loadAllPayroll() {
  const month  = document.getElementById('pr-month').value;
  const year   = document.getElementById('pr-year').value;
  const status = document.getElementById('pr-status').value;
  let qs = `?month=${month}&year=${year}`;
  if (status) qs += `&status=${status}`;
  const rows = await api.get(`/payroll${qs}`);
  const tbody = document.getElementById('all-payroll-tbody');
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No payroll records</p></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">${avatarEl({ first_name: r.employee_name?.split(' ')[0] || '?', last_name: r.employee_name?.split(' ')[1] || '', photo_url: r.photo_url }, 'sm')}<span style="font-weight:500">${r.employee_name}</span></div></td>
      <td><span class="badge badge-neutral">${payrollTypeLabel(r)}</span></td>
      <td>${r.department_name || '-'}</td>
      <td>${fmt.currency(Number(r.base_salary || 0) + Number(r.allowances || 0) + Number(r.overtime_pay || 0))}</td>
      <td style="color:var(--danger-fg)">-${fmt.currency(r.deductions)}</td>
      <td style="font-weight:600">${fmt.currency(r.net_salary)}</td>
      <td>${fmt.statusBadge(r.status)}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="viewPayslip(${r.id})">View</button>
        <button class="btn btn-primary btn-sm" onclick="showAmountModal(${r.id})">Edit payroll</button>
        ${r.status === 'processed' ? `<button class="btn btn-success btn-sm" onclick="markPaid(${r.id})">Mark Paid</button>` : ''}
      </td>
    </tr>`).join('');
}

function showAmountModal(id) {
  api.get(`/payroll/${id}`).then((row) => {
    const gross = Number(row.base_salary || 0) + Number(row.allowances || 0);
    const tax = Number(row.tax ?? row.deductions ?? 0);
    const ssnitEmployee = Number(row.ssnit_employee || 0);
    const otherDeductions = Number(row.other_deductions || 0);
    const currencyDigits = fmt.currencyFractionDigits();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Edit payroll</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">x</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary);margin-bottom:16px">${row.first_name} ${row.last_name} - ${months[row.month - 1]} ${row.year}</p>
          <p style="font-size:.82rem;color:var(--text-muted);margin:-8px 0 16px">All amounts are in ${fmt.currencyCode()}. Gross pay and net pay are calculated automatically.</p>
          <div class="form-grid">
            <div class="form-group"><label class="form-label">Base salary</label><input type="number" min="0" id="pay-base" class="form-control" step="${fmt.currencyStep()}" value="${Number(row.base_salary || 0)}"></div>
            <div class="form-group"><label class="form-label">Allowances</label><input type="number" min="0" id="pay-allowances" class="form-control" step="${fmt.currencyStep()}" value="${Number(row.allowances || 0)}"></div>
            <div class="form-group"><label class="form-label">Tax</label><input type="number" min="0" id="pay-tax" class="form-control" step="${fmt.currencyStep()}" value="${tax}"></div>
            <div class="form-group"><label class="form-label">SSNIT (employee)</label><input type="number" id="pay-ssnit" class="form-control" readonly value="${ssnitEmployee.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label">Other deductions</label><input type="number" min="0" id="pay-other-deductions" class="form-control" step="${fmt.currencyStep()}" value="${otherDeductions}"></div>
            <div class="form-group"><label class="form-label">Gross pay</label><input type="number" id="pay-gross" class="form-control" readonly value="${gross.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label">Net pay</label><input type="number" id="pay-net" class="form-control" readonly value="${Number(row.net_salary || 0).toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label">Status</label><select id="pay-status" class="form-control form-select">
              <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="processed" ${row.status === 'processed' ? 'selected' : ''}>Processed</option>
              <option value="paid" ${row.status === 'paid' ? 'selected' : ''}>Paid</option>
            </select></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="savePayrollAmounts(${row.id})">Save Amounts</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const syncTotals = () => {
      const baseValue = Number(document.getElementById('pay-base').value || 0);
      const allowanceValue = Number(document.getElementById('pay-allowances').value || 0);
      const taxValue = Number(document.getElementById('pay-tax').value || 0);
      const ssnitValue = Number(document.getElementById('pay-ssnit').value || 0);
      const otherValue = Number(document.getElementById('pay-other-deductions').value || 0);
      const grossValue = Math.max(0, baseValue + allowanceValue);
      document.getElementById('pay-gross').value = grossValue.toFixed(currencyDigits);
      document.getElementById('pay-net').value = Math.max(0, grossValue - taxValue - ssnitValue - otherValue).toFixed(currencyDigits);
    };
    ['pay-base', 'pay-allowances', 'pay-tax', 'pay-other-deductions'].forEach((field) => document.getElementById(field).addEventListener('input', syncTotals));
  }).catch((e) => toast(e.message, 'error'));
}

async function savePayrollAmounts(id) {
  try {
    const base = Number(document.getElementById('pay-base').value || 0);
    await api.put(`/payroll/${id}`, {
      base_salary: base,
      allowances: Number(document.getElementById('pay-allowances').value || 0),
      tax: Number(document.getElementById('pay-tax').value || 0),
      other_deductions: Number(document.getElementById('pay-other-deductions').value || 0),
      status: document.getElementById('pay-status').value
    });
    document.querySelector('.modal-overlay')?.remove();
    toast('Payroll amounts updated', 'success');
    loadAllPayroll();
    loadSummary();
  } catch (e) {
    toast(e.message || 'Could not update payroll', 'error');
  }
}

async function markPaid(id) {
  try {
    await api.patch(`/payroll/${id}/paid`);
    toast('Marked as paid!', 'success');
    loadAllPayroll();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadSummary() {
  const rows = await api.get('/payroll/summary');
  const tbody = document.getElementById('summary-tbody');
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No data</p></div></td></tr>`; return; }
  renderPayrollTrend('payroll-chart', rows.slice().reverse());
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-weight:500">${months[r.month-1]} ${r.year}</td>
      <td>${r.employee_count}</td>
      <td>${fmt.currency(r.total_base)}</td>
      <td style="color:var(--danger-fg)">-${fmt.currency(r.total_deductions)}</td>
      <td style="font-weight:600">${fmt.currency(r.total_net)}</td>
      <td>${r.paid_count}/${r.employee_count} paid</td>
    </tr>`).join('');
}

function showProcessModal() {
  const monthSelect = document.getElementById('process-payroll-month');
  const yearSelect = document.getElementById('process-payroll-year');
  if (!monthSelect.options.length) {
    months.forEach((month, index) => { monthSelect.innerHTML += `<option value="${index + 1}">${month}</option>`; });
    for (let year = now.getFullYear() + 1; year >= now.getFullYear() - 3; year--) {
      yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    }
  }
  monthSelect.value = String(now.getMonth() + 1);
  yearSelect.value = String(now.getFullYear());
  document.getElementById('process-payroll-confirm').checked = false;
  toggleProcessPayrollButton();
  document.getElementById('process-payroll-modal').style.display = 'flex';
}

async function showOvertimeRateModal() {
  try {
    const settings = await api.get('/attendance/overtime/settings');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="max-width:440px"><div class="modal-header"><h3>Overtime rate</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button></div><div class="modal-body"><p style="color:var(--text-secondary);margin-bottom:16px">Approved overtime is paid at this hourly rate when payroll is processed.</p><div class="form-group"><label class="form-label">Hourly overtime rate (${fmt.currencyCode()})</label><input id="overtime-hourly-rate" type="number" class="form-control" min="0" step="${fmt.currencyStep()}" value="${Number(settings.hourly_rate || 0)}"></div><p style="font-size:.8rem;color:var(--text-muted)">Employees are prompted for an overtime reason after clocking out later than ${String(settings.late_clock_out_after || '17:30').slice(0,5)}.</p></div><div class="modal-footer"><button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button><button class="btn btn-primary" onclick="saveOvertimeRate(this)">Save rate</button></div></div>`;
    document.body.appendChild(overlay);
  } catch (error) { toast(error.message || 'Could not load overtime settings', 'error'); }
}
async function saveOvertimeRate(button) {
  try {
    await api.put('/attendance/overtime/settings', { hourly_rate: Number(document.getElementById('overtime-hourly-rate').value) });
    button.closest('.modal-overlay').remove(); toast('Overtime hourly rate saved', 'success');
  } catch (error) { toast(error.message || 'Could not save overtime rate', 'error'); }
}

function closeProcessPayrollModal() {
  document.getElementById('process-payroll-modal').style.display = 'none';
}

function toggleProcessPayrollButton() {
  document.getElementById('process-payroll-submit').disabled = !document.getElementById('process-payroll-confirm').checked;
}

async function submitPayrollProcess() {
  const submit = document.getElementById('process-payroll-submit');
  const month = Number(document.getElementById('process-payroll-month').value);
  const year = Number(document.getElementById('process-payroll-year').value);
  if (!month || !year || !document.getElementById('process-payroll-confirm').checked) return;
  submit.disabled = true;
  submit.textContent = 'Processing…';
  try {
    const result = await api.post('/payroll/process', { month, year });
    closeProcessPayrollModal();
    toast(`Payroll processed for ${result.count} employees`, 'success');
    switchTab('all');
  } catch (error) {
    toast(error.message || 'Could not process payroll', 'error');
    submit.disabled = false;
  } finally {
    submit.textContent = 'Process payroll';
  }
}

loadMyPayslips();

function payrollTypeLabel(row) {
  const labels = {
    staff: 'Staff',
    contractual: 'Contractual',
    national_service: 'National Service',
    internship: 'Internship'
  };
  return labels[row.employment_type] || (/contract/i.test(row.job_title || '') ? 'Contractual' : 'Staff');
}

function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
