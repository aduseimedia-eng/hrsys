const user = requireAuth();
if (!user) throw new Error('redirect');
buildSidebar('payroll');
loadNotifCount();

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();
const payrollTrendCharts = {};
let activePayrollTab = user.role === 'admin' ? 'overview' : 'mine';
let payrollRegisterRows = [];
let payrollDashboardRequest = 0;
let payrollRegisterRequest = 0;
let payrollRegisterLoading = false;
let payrollSummaryRequest = 0;
let overtimeSettingsLoading = false;
let payrollPayslipRequest = 0;
let payrollEditRequest = 0;

const payrollBranding = (() => {
  try {
    return JSON.parse(localStorage.getItem(`hrconnect.branding.${user.company_id}`) || '{}');
  } catch (_) {
    return {};
  }
})();
const payrollCompanyName = payrollBranding.name || user.company_name || 'KenadHR';
const payrollCompanyInitials = payrollCompanyName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0])
  .join('')
  .toUpperCase() || 'HR';

const payrollIconPaths = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  runs: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  wallet: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M16 14h2"/>',
  chart: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2c0 5 2 7 5 10-3 3-5 5-5 10M17 2c0 5-2 7-5 10 3 3 5 5 5 10"/>'
};

function payrollIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${payrollIconPaths[name] || payrollIconPaths.wallet}</svg>`;
}

document.getElementById('payroll-current-period').textContent = `${months[now.getMonth()]} ${now.getFullYear()}`;

if (user.role === 'admin') {
  document.getElementById('overview-tab').style.display = '';
  document.getElementById('admin-tab').style.display = '';
  document.getElementById('summary-tab').style.display = '';

  document.getElementById('admin-payroll-actions').innerHTML =
    `<button class="btn btn-outline" type="button" onclick="showOvertimeRateModal()">${payrollIcon('clock')} Overtime settings</button>
     <button class="btn btn-outline" type="button" onclick="navigateToPayrollRuns()">${payrollIcon('runs')} Payroll runs</button>
     <button class="btn btn-primary" type="button" onclick="navigateToPayrollProcessing()">${payrollIcon('play')} Run payroll</button>`;

  const mSel = document.getElementById('pr-month');
  const ySel = document.getElementById('pr-year');
  months.forEach((m, i) => mSel.innerHTML += `<option value="${i+1}" ${i===now.getMonth()?'selected':''}>${m}</option>`);
  for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
    ySel.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
  }
  document.getElementById('payroll-hero-description').textContent = 'Run payroll, review costs, and move every payslip from draft to paid.';
  updatePayrollPeriodLabels();
} else {
  document.getElementById('payroll-tabs').style.display = 'none';
  document.getElementById('payroll-eyebrow').textContent = 'Employee payroll';
  document.getElementById('payroll-page-title').textContent = 'Your pay, clearly explained';
  document.getElementById('payroll-hero-description').textContent = 'Review your payslips, deductions, and take-home pay in one secure place.';
}

async function loadPayrollDashboard() {
  const dashboard = document.getElementById('payroll-dashboard');
  if (!dashboard || user.role !== 'admin') return;
  const requestId = ++payrollDashboardRequest;
  const month = Number(document.getElementById('pr-month').value || now.getMonth() + 1);
  const year = Number(document.getElementById('pr-year').value || now.getFullYear());
  const periodLabel = `${months[month - 1]} ${year}`;
  const errorBox = document.getElementById('payroll-dashboard-error');
  errorBox.hidden = true;
  dashboard.setAttribute('aria-busy', 'true');
  showPayrollDashboardState('loading', periodLabel);
  try {
    const [summary, rows] = await Promise.all([
      api.get('/payroll/summary'),
      api.get(`/payroll?month=${month}&year=${year}`)
    ]);
    if (requestId !== payrollDashboardRequest) return;
    const gross = rows.reduce((total, row) => total + Number(row.base_salary || 0) + Number(row.allowances || 0) + Number(row.overtime_pay || 0), 0);
    const deductions = rows.reduce((total, row) => total + Number(row.deductions || 0), 0);
    const net = rows.reduce((total, row) => total + Number(row.net_salary || 0), 0);
    const statusCount = (status) => rows.filter((row) => row.status === status).length;
    const metrics = [
      { label: 'Net payroll', value: fmt.currency(net), detail: `${rows.length} payslip${rows.length === 1 ? '' : 's'}`, tone: 'net', icon: 'wallet' },
      { label: 'Gross pay', value: fmt.currency(gross), detail: periodLabel, tone: 'gross', icon: 'chart' },
      { label: 'Deductions', value: fmt.currency(deductions), detail: gross ? `${Math.round((deductions / gross) * 100)}% of gross pay` : 'No deductions recorded', tone: 'deductions', icon: 'minus' },
      { label: 'Paid payslips', value: String(statusCount('paid')), detail: `${rows.length ? Math.round((statusCount('paid') / rows.length) * 100) : 0}% complete`, tone: 'paid', icon: 'check' }
    ];
    document.getElementById('payroll-kpis').innerHTML = metrics.map((metric) => `
      <article class="payroll-kpi payroll-kpi--${metric.tone}">
        <div class="payroll-kpi-label"><span class="payroll-kpi-icon">${payrollIcon(metric.icon)}</span><span>${metric.label}</span></div>
        <strong>${metric.value}</strong>
        <small>${metric.detail}</small>
      </article>`).join('');
    document.getElementById('payroll-pipeline').innerHTML = [
      ['Pending', statusCount('pending'), 'draft', 'hourglass', 'Awaiting payroll review'],
      ['Processed', statusCount('processed'), 'review', 'chart', 'Ready to mark as paid'],
      ['Paid', statusCount('paid'), 'paid', 'check', 'Payment completed']
    ].map(([label, value, style, icon, description]) => `
      <div class="payroll-stage ${style}">
        <span class="payroll-stage-marker">${payrollIcon(icon)}</span>
        <span class="payroll-stage-copy"><span>${label}</span><small>${description}</small></span>
        <strong>${value}</strong>
      </div>`).join('');
    document.getElementById('payroll-pipeline-period').textContent = periodLabel;
    renderPayrollTrend('payroll-dashboard-trend', summary.slice().reverse());
    const departments = rows.reduce((grouped, row) => {
      const name = row.department_name || 'Unassigned';
      grouped[name] = (grouped[name] || 0) + Number(row.net_salary || 0);
      return grouped;
    }, {});
    renderPayrollDoughnut('payroll-department-chart', Object.keys(departments), Object.values(departments));
    const deductionParts = {
      Tax: rows.reduce((total, row) => total + Number(row.tax || 0), 0),
      SSNIT: rows.reduce((total, row) => total + Number(row.ssnit_employee || 0), 0),
      Other: rows.reduce((total, row) => total + Number(row.other_deductions || 0) + Number(row.loan_deductions || 0) + Number(row.benefit_deductions || 0), 0)
    };
    renderPayrollDoughnut('payroll-deduction-chart', Object.keys(deductionParts), Object.values(deductionParts));
    const topEarners = rows.slice().sort((a, b) => Number(b.net_salary || 0) - Number(a.net_salary || 0)).slice(0, 6);
    document.getElementById('payroll-top-earners').innerHTML = topEarners.length ? topEarners.map((row) => `<div class="payroll-person"><div><strong>${safe(row.employee_name || 'Employee')}</strong><small>${safe(row.department_name || 'No department')}</small></div><b>${fmt.currency(row.net_salary)}</b></div>`).join('') : '<div class="payroll-chart-empty"><span>No payments</span><small>Run payroll to see this period.</small></div>';
    document.getElementById('payroll-glance').innerHTML = [
      ['Employees included', String(rows.length), 'This pay period'],
      ['Needs completion', String(statusCount('pending') + statusCount('processed')), 'Pending or processed'],
      ['Average net pay', fmt.currency(rows.length ? net / rows.length : 0), 'Across all payslips']
    ].map(([label, value, detail]) => `<div class="payroll-person"><div><strong>${label}</strong><small>${detail}</small></div><b>${value}</b></div>`).join('');
    dashboard.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (requestId !== payrollDashboardRequest) return;
    errorBox.textContent = error.message || 'Could not load the payroll overview.';
    errorBox.hidden = false;
    showPayrollDashboardState('error', periodLabel);
    dashboard.setAttribute('aria-busy', 'false');
  }
}

function showPayrollDashboardState(state, periodLabel) {
  const loading = state === 'loading';
  const kpis = document.getElementById('payroll-kpis');
  ['payroll-dashboard-trend', 'payroll-department-chart', 'payroll-deduction-chart'].forEach((hostId) => {
    payrollTrendCharts[hostId]?.destroy?.();
    delete payrollTrendCharts[hostId];
  });
  kpis.innerHTML = loading
    ? Array.from(
      { length: 4 },
      () => '<article class="payroll-kpi payroll-loading-card"><div class="payroll-skeleton label"></div><div class="payroll-skeleton value"></div><div class="payroll-skeleton note"></div></article>'
    ).join('')
    : '<div class="payroll-dashboard-placeholder"><strong>Overview unavailable</strong><span>No figures are shown until this period reloads successfully.</span></div>';

  const placeholder = loading
    ? '<div class="payroll-dashboard-placeholder" role="status"><div class="spinner"></div><span>Loading selected period...</span></div>'
    : '<div class="payroll-dashboard-placeholder"><strong>Data unavailable</strong><span>Try loading this period again.</span></div>';
  ['payroll-pipeline', 'payroll-glance', 'payroll-dashboard-trend', 'payroll-department-chart', 'payroll-deduction-chart', 'payroll-top-earners']
    .forEach((hostId) => {
      const host = document.getElementById(hostId);
      host.removeAttribute('role');
      host.removeAttribute('aria-label');
      host.innerHTML = placeholder;
    });
  document.getElementById('payroll-pipeline-period').textContent = periodLabel;
}

function renderPayrollTrend(hostId, rows) {
  const host = document.getElementById(hostId);
  if (!host) return;
  payrollTrendCharts[hostId]?.destroy?.();
  host.replaceChildren();
  host.removeAttribute('role');
  host.removeAttribute('aria-label');
  if (!rows.length) {
    host.innerHTML = '<div class="payroll-chart-empty"><span>No trend data yet</span><small>Processed payroll periods will appear here.</small></div>';
    return;
  }
  const latest = rows.at(-1);
  const latestLabel = `${months[Number(latest.month) - 1]} ${latest.year}`;
  const chartDescription = `Payroll trend across ${rows.length} period${rows.length === 1 ? '' : 's'}. ${latestLabel}: gross ${fmt.currency(latest.total_gross || latest.total_base || 0)}, deductions ${fmt.currency(latest.total_deductions || 0)}, and net ${fmt.currency(latest.total_net || 0)}.`;
  if (!window.Chart) {
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', chartDescription);
    KenadCharts.line(host, rows.map((row) => `${months[Number(row.month) - 1].slice(0, 3)} ${String(row.year).slice(-2)}`), rows.map((row) => Number(row.total_net || 0)), '#2563eb');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', chartDescription);
  host.appendChild(canvas);
  const brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#3977ee';
  payrollTrendCharts[hostId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map((row) => `${months[Number(row.month) - 1].slice(0, 3)} ${String(row.year).slice(-2)}`),
      datasets: [
        { label: 'Gross', data: rows.map((row) => Number(row.total_gross || row.total_base || 0)), borderColor: brandColor, backgroundColor: 'rgba(57,119,238,.10)', fill: true },
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

function renderPayrollDoughnut(hostId, labels, values) {
  const host = document.getElementById(hostId);
  if (!host) return;
  payrollTrendCharts[hostId]?.destroy?.();
  host.replaceChildren();
  host.removeAttribute('role');
  host.removeAttribute('aria-label');
  const rankedEntries = labels
    .map((label, index) => ({ label, value: Number(values[index] || 0) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  const entries = rankedEntries.length > 5
    ? [
      ...rankedEntries.slice(0, 5),
      { label: 'Other', value: rankedEntries.slice(5).reduce((total, entry) => total + entry.value, 0) }
    ]
    : rankedEntries;
  if (!entries.length) {
    host.innerHTML = '<div class="payroll-chart-empty"><span>No cost data yet</span><small>Values will appear after payroll is run.</small></div>';
    return;
  }
  const chartDescription = entries.map((entry) => `${entry.label}: ${fmt.currency(entry.value)}`).join(', ');
  if (!window.Chart) {
    host.innerHTML = `<div class="payroll-chart-legend">${entries.map((entry) => `<div><span>${safe(entry.label)}</span><strong>${fmt.currency(entry.value)}</strong></div>`).join('')}</div>`;
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Payroll cost breakdown. ${chartDescription}.`);
  host.appendChild(canvas);
  const brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#3977ee';
  payrollTrendCharts[hostId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map((entry) => entry.label),
      datasets: [{
        data: entries.map((entry) => entry.value),
        backgroundColor: [brandColor, '#6b9af0', '#91b3f5', '#d9a64d', '#c85d72', '#7a86ad'],
        borderColor: '#fff',
        borderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 13, color: '#647189', font: { size: 10, weight: '600' } }
        },
        tooltip: {
          backgroundColor: '#172442',
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: (item) => `${item.label}: ${fmt.currency(item.raw)}` }
        }
      }
    }
  });
}

function updatePayrollPeriodLabels() {
  if (user.role !== 'admin') return;
  const month = Number(document.getElementById('pr-month').value || now.getMonth() + 1);
  const year = Number(document.getElementById('pr-year').value || now.getFullYear());
  const label = `${months[month - 1]} ${year}`;
  document.getElementById('payroll-current-period').textContent = label;
  document.getElementById('payroll-period-label').textContent = `Reviewing ${label}`;
}

function refreshPayrollPeriod() {
  updatePayrollPeriodLabels();
  if (activePayrollTab === 'overview') loadPayrollDashboard();
  if (activePayrollTab === 'all') loadAllPayroll();
}

function switchTab(tab) {
  const adminTabs = ['overview', 'all', 'summary'];
  if (user.role !== 'admin' && adminTabs.includes(tab)) return;
  const tabs = ['overview', 'all', 'mine', 'summary'];
  if (activePayrollTab !== tab) {
    payrollPayslipRequest += 1;
    payrollEditRequest += 1;
  }
  activePayrollTab = tab;
  tabs.forEach((name) => {
    const panel = document.getElementById(`tab-${name}`);
    if (panel) panel.style.display = name === tab ? '' : 'none';
  });
  document.querySelectorAll('[data-payroll-tab]').forEach((button) => {
    const selected = button.dataset.payrollTab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  document.getElementById('payroll-period-toolbar').style.display =
    user.role === 'admin' && ['overview', 'all'].includes(tab) ? 'flex' : 'none';
  document.getElementById('payroll-period-chip').style.display =
    user.role === 'admin' && ['overview', 'all'].includes(tab) ? 'inline-flex' : 'none';
  if (tab === 'overview') loadPayrollDashboard();
  if (tab === 'all') loadAllPayroll();
  if (tab === 'summary') loadSummary();
}

function navigateToPayrollPage(route) {
  if (isEmbeddedWorkspacePage()) {
    window.parent.postMessage({ type: 'hrconnect:navigate', route }, window.location.origin);
    return;
  }
  location.href = appUrl(`/pages/workspace.html#${route}`);
}

function navigateToPayrollProcessing() {
  navigateToPayrollPage('process-payroll');
}

function navigateToPayrollRuns() {
  navigateToPayrollPage('payroll-runs');
}

async function loadMyPayslips() {
  const grid = document.getElementById('my-payslips-grid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const slips = await api.get('/payroll/mine');
    if (!slips.length) {
      grid.innerHTML = '<div class="empty-state"><h3>No payslips yet</h3><p>Your payslips will appear here as soon as payroll is processed.</p></div>';
      return;
    }
    grid.innerHTML = slips.map((slip) => {
      const monthName = months[slip.month - 1];
      return `<article class="payslip-card" role="button" tabindex="0" aria-label="Open payslip for ${monthName} ${slip.year}" onclick="viewPayslip(${slip.id})" onkeydown="openPayslipFromKeyboard(event, ${slip.id})">
        <div class="payslip-header">
          <span class="payslip-period-mark">${monthName.slice(0, 3)}</span>
          <span class="payslip-period-copy"><span>Pay period</span><span class="payslip-month">${monthName} ${slip.year}</span></span>
          ${fmt.statusBadge(slip.status)}
        </div>
        <div class="payslip-body">
          <div class="payslip-row"><span>Base salary</span><span>${fmt.currency(slip.base_salary)}</span></div>
          <div class="payslip-row"><span>Allowances</span><span class="positive">+${fmt.currency(slip.allowances)}</span></div>
          ${Number(slip.overtime_pay || 0) ? `<div class="payslip-row"><span>Overtime (${Number(slip.overtime_hours || 0).toFixed(2)} h)</span><span class="positive">+${fmt.currency(slip.overtime_pay)}</span></div>` : ''}
          <div class="payslip-row"><span>Deductions</span><span class="negative">-${fmt.currency(slip.deductions)}</span></div>
          <div class="payslip-net-row">
            <span class="payslip-net-copy"><span>Net pay</span><strong class="payslip-net">${fmt.currency(slip.net_salary)}</strong></span>
            <span class="payslip-open">View payslip <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span>
          </div>
        </div>
      </article>`;
    }).join('');
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><h3>Could not load payslips</h3><p>${safe(error.message || 'Please try again shortly.')}</p></div>`;
  }
}

function openPayslipFromKeyboard(event, id) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  viewPayslip(id);
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
  const requestId = ++payrollPayslipRequest;
  try {
    const s = await api.get(`/payroll/${id}`);
    if (requestId !== payrollPayslipRequest) return;
    const monthName = months[s.month - 1];
    document.getElementById('payslip-modal-title').textContent = `${monthName} ${s.year} payslip`;
    document.getElementById('payslip-detail').innerHTML = `
    <div class="payslip-detail" id="printable-payslip">
      <div class="payslip-detail-header">
        <div class="company-logo">
          <div class="mark">${safe(payrollCompanyInitials)}</div>
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.1rem">${safe(payrollCompanyName)}</div>
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
        <div class="detail-row"><span>Name</span><span>${safe(s.first_name)} ${safe(s.last_name)}</span></div>
        <div class="detail-row"><span>Job title</span><span>${safe(s.job_title || '-')}</span></div>
        <div class="detail-row"><span>Department</span><span>${safe(s.department_name || '-')}</span></div>
        <div class="detail-row"><span>Email</span><span>${safe(s.email || '-')}</span></div>
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
  } catch (error) {
    if (requestId !== payrollPayslipRequest) return;
    toast(error.message || 'Could not open this payslip', 'error');
  }
}

function closePayslipModal() {
  payrollPayslipRequest += 1;
  document.getElementById('payslip-modal').style.display = 'none';
  window.dispatchEvent(new Event('hrconnect:request-page-height'));
}

function payrollPrintStyles() {
  return `
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{margin:0;padding:24px;background:#fff;color:#202a3d;font-family:Inter,Arial,sans-serif}
    .payslip-detail{max-width:760px;margin:0 auto;padding:30px;border:1px solid #dfe6f2;border-radius:12px;background:#fff}
    .payslip-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:26px;padding-bottom:20px;border-bottom:2px solid #172442}
    .company-logo{display:flex;align-items:center;gap:11px}
    .company-logo .mark{display:grid;width:42px;height:42px;place-items:center;border-radius:10px;background:#172442;color:#fff;font-weight:800}
    .detail-section{margin-bottom:22px}
    .detail-section h4{margin:0 0 8px;color:#3977ee;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
    .detail-row{display:flex;justify-content:space-between;gap:20px;padding:8px 0;border-bottom:1px solid #e7edf5;color:#647189;font-size:12px}
    .detail-row span:last-child{color:#202a3d;font-weight:600;text-align:right}
    .detail-row.total{margin-top:3px;border-top:1px solid #c6d4ec;border-bottom:0;color:#202a3d;font-weight:700}
    .positive{color:#227356!important}.negative{color:#b5475d!important}
    .net-salary-box{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:10px;padding:18px 20px;border:1px solid #bedfd3;border-radius:11px;background:#edf9f4}
    .net-amount{color:#172442;font-size:26px;font-weight:800;letter-spacing:-.04em}
    .badge{display:inline-flex;padding:3px 8px;border-radius:999px;background:#e8f0ff;color:#2865d9;font-size:10px;font-weight:700;text-transform:capitalize}
    @media print{body{padding:0}.payslip-detail{border:0;padding:0}}
  `;
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
  style.textContent = payrollPrintStyles();
  doc.head.appendChild(style);

  doc.body.innerHTML = printable.outerHTML;
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
          <div class="mark">${safe(payrollCompanyInitials)}</div>
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:1.1rem">${safe(payrollCompanyName)}</div>
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
  const w = window.open('', '_blank');
  if (!w) {
    toast('Allow popups to print these payslips.', 'warning');
    return;
  }
  try {
    const month = document.getElementById('pr-month').value;
    const year = document.getElementById('pr-year').value;
    const rows = await api.get(`/payroll?month=${month}&year=${year}`);
    if (!rows.length) {
      w.close();
      toast('No payslips for this period.', 'warning');
      return;
    }
    w.document.title = `Payslips ${months[month - 1]} ${year}`;
    w.document.head.innerHTML = `
      <link rel="stylesheet" href="../css/main.css">
      <style>
        ${payrollPrintStyles()}
        .payslip-detail{margin-bottom:30px}
        .printable-slip{break-after:page;page-break-after:always}
        .printable-slip:last-child{break-after:auto;page-break-after:auto}
        @media print{.printable-slip{min-height:96vh}}
      </style>`;
    w.document.body.innerHTML = rows.map((row) => payslipHtml(row)).join('');
    w.focus();
    setTimeout(() => w.print(), 350);
  } catch (e) {
    w.close();
    toast(e.message || 'Could not prepare payslips', 'error');
  }
}

async function loadAllPayroll() {
  const requestId = ++payrollRegisterRequest;
  const month  = document.getElementById('pr-month').value;
  const year   = document.getElementById('pr-year').value;
  const status = document.getElementById('pr-status').value;
  let qs = `?month=${month}&year=${year}`;
  if (status) qs += `&status=${status}`;
  const tbody = document.getElementById('all-payroll-tbody');
  payrollRegisterRows = [];
  payrollRegisterLoading = true;
  document.getElementById('payroll-register-count').textContent = 'Loading...';
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading-state"><div class="spinner"></div></div></td></tr>';
  try {
    const rows = await api.get(`/payroll${qs}`);
    if (requestId !== payrollRegisterRequest) return;
    payrollRegisterLoading = false;
    payrollRegisterRows = rows;
    filterPayrollRegister();
  } catch (error) {
    if (requestId !== payrollRegisterRequest) return;
    payrollRegisterLoading = false;
    payrollRegisterRows = [];
    document.getElementById('payroll-register-count').textContent = '0 records';
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>Could not load payroll</h3><p>${safe(error.message || 'Please try again shortly.')}</p></div></td></tr>`;
  }
}

function filterPayrollRegister() {
  if (payrollRegisterLoading) return;
  const query = document.getElementById('pr-search').value.trim().toLowerCase();
  const rows = query
    ? payrollRegisterRows.filter((row) => `${row.employee_name || ''} ${row.department_name || ''} ${row.job_title || ''}`.toLowerCase().includes(query))
    : payrollRegisterRows;
  renderPayrollRegister(rows, Boolean(query || document.getElementById('pr-status').value));
}

function renderPayrollRegister(rows, isFiltered = false) {
  const tbody = document.getElementById('all-payroll-tbody');
  document.getElementById('payroll-register-count').textContent =
    `${rows.length} record${rows.length === 1 ? '' : 's'}${isFiltered ? ' found' : ''}`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>${isFiltered ? 'No records match these filters' : 'No payroll for this period'}</h3><p>${isFiltered ? 'Try a different search or clear the filters.' : 'Run payroll to create payslips for the selected month.'}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>
        <div class="payroll-employee">
          ${avatarEl({ first_name: row.employee_name?.split(' ')[0] || '?', last_name: row.employee_name?.split(' ')[1] || '', photo_url: row.photo_url }, 'sm')}
          <span class="payroll-employee-copy"><strong>${safe(row.employee_name || 'Employee')}</strong><small>${safe(row.job_title || 'No job title')}</small></span>
        </div>
      </td>
      <td><span class="badge badge-neutral">${safe(payrollTypeLabel(row))}</span></td>
      <td>${safe(row.department_name || 'Unassigned')}</td>
      <td class="payroll-number">${fmt.currency(Number(row.base_salary || 0) + Number(row.allowances || 0) + Number(row.overtime_pay || 0))}</td>
      <td class="payroll-number payroll-deduction-value">-${fmt.currency(row.deductions)}</td>
      <td class="payroll-number payroll-net-value">${fmt.currency(row.net_salary)}</td>
      <td>${fmt.statusBadge(row.status)}</td>
      <td><div class="payroll-row-actions">
        <button class="btn btn-outline btn-sm" type="button" onclick="viewPayslip(${row.id})">View</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="showAmountModal(${row.id})">Edit</button>
        ${row.status === 'processed' ? `<button class="btn btn-success btn-sm" type="button" onclick="markPaid(${row.id})">Mark paid</button>` : ''}
      </div></td>
    </tr>`).join('');
}

function clearPayrollFilters() {
  document.getElementById('pr-search').value = '';
  document.getElementById('pr-status').value = '';
  loadAllPayroll();
}

function showAmountModal(id) {
  const requestId = ++payrollEditRequest;
  api.get(`/payroll/${id}`).then((row) => {
    if (requestId !== payrollEditRequest) return;
    const overtimePay = Number(row.overtime_pay || 0);
    const lockedDeductions = Number(row.benefit_deductions || 0) + Number(row.loan_deductions || 0);
    const gross = Number(row.base_salary || 0) + Number(row.allowances || 0) + overtimePay;
    const tax = Number(row.tax ?? row.deductions ?? 0);
    const ssnitEmployee = Number(row.ssnit_employee || 0);
    const otherDeductions = Number(row.other_deductions || 0);
    const currencyDigits = fmt.currencyFractionDigits();
    document.getElementById('payroll-edit-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'payroll-edit-modal';
    overlay.innerHTML = `
      <div class="modal payroll-edit-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title">
        <div class="modal-header">
          <div><h3 id="payroll-edit-title">Edit payroll</h3><p>${safe(row.first_name)} ${safe(row.last_name)} &middot; ${months[row.month - 1]} ${row.year}</p></div>
          <button class="modal-close" type="button" aria-label="Close payroll editor" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="payroll-edit-note">${payrollIcon('wallet')}<span>Amounts are in <strong>${fmt.currencyCode()}</strong>. Gross and net pay update automatically as you edit.</span></div>
          <div class="form-grid">
            <div class="form-group"><label class="form-label" for="pay-base">Base salary</label><input type="number" min="0" id="pay-base" class="form-control" step="${fmt.currencyStep()}" value="${Number(row.base_salary || 0)}"></div>
            <div class="form-group"><label class="form-label" for="pay-allowances">Allowances</label><input type="number" min="0" id="pay-allowances" class="form-control" step="${fmt.currencyStep()}" value="${Number(row.allowances || 0)}"></div>
            <div class="form-group"><label class="form-label" for="pay-tax">Tax</label><input type="number" min="0" id="pay-tax" class="form-control" step="${fmt.currencyStep()}" value="${tax}"></div>
            <div class="form-group"><label class="form-label" for="pay-ssnit">SSNIT (employee)</label><input type="number" id="pay-ssnit" class="form-control" readonly value="${ssnitEmployee.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label" for="pay-other-deductions">Other deductions</label><input type="number" min="0" id="pay-other-deductions" class="form-control" step="${fmt.currencyStep()}" value="${otherDeductions}"></div>
            <div class="form-group"><label class="form-label" for="pay-overtime">Overtime pay</label><input type="number" id="pay-overtime" class="form-control" readonly value="${overtimePay.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label" for="pay-locked-deductions">Benefits &amp; loans</label><input type="number" id="pay-locked-deductions" class="form-control" readonly value="${lockedDeductions.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label" for="pay-gross">Gross pay</label><input type="number" id="pay-gross" class="form-control" readonly value="${gross.toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label" for="pay-net">Net pay</label><input type="number" id="pay-net" class="form-control" readonly value="${Number(row.net_salary || 0).toFixed(currencyDigits)}"></div>
            <div class="form-group"><label class="form-label" for="pay-status">Status</label><select id="pay-status" class="form-control form-select">
              <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="processed" ${row.status === 'processed' ? 'selected' : ''}>Processed</option>
              <option value="paid" ${row.status === 'paid' ? 'selected' : ''}>Paid</option>
            </select></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" type="button" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" type="button" onclick="savePayrollAmounts(${row.id})">Save changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const syncTotals = () => {
      const baseValue = Number(document.getElementById('pay-base').value || 0);
      const allowanceValue = Number(document.getElementById('pay-allowances').value || 0);
      const taxValue = Number(document.getElementById('pay-tax').value || 0);
      const ssnitValue = Number(document.getElementById('pay-ssnit').value || 0);
      const otherValue = Number(document.getElementById('pay-other-deductions').value || 0);
      const overtimeValue = Number(document.getElementById('pay-overtime').value || 0);
      const lockedValue = Number(document.getElementById('pay-locked-deductions').value || 0);
      const grossValue = Math.max(0, baseValue + allowanceValue + overtimeValue);
      document.getElementById('pay-gross').value = grossValue.toFixed(currencyDigits);
      document.getElementById('pay-net').value = Math.max(0, grossValue - taxValue - ssnitValue - otherValue - lockedValue).toFixed(currencyDigits);
    };
    ['pay-base', 'pay-allowances', 'pay-tax', 'pay-other-deductions'].forEach((field) => document.getElementById(field).addEventListener('input', syncTotals));
  }).catch((e) => {
    if (requestId === payrollEditRequest) toast(e.message || 'Could not load payroll details', 'error');
  });
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
    document.getElementById('payroll-edit-modal')?.remove();
    toast('Payroll amounts updated', 'success');
    loadAllPayroll();
  } catch (e) {
    toast(e.message || 'Could not update payroll', 'error');
  }
}

async function markPaid(id) {
  try {
    await api.patch(`/payroll/${id}/paid`);
    toast('Payslip marked as paid', 'success');
    loadAllPayroll();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadSummary() {
  const requestId = ++payrollSummaryRequest;
  const tbody = document.getElementById('summary-tbody');
  const chart = document.getElementById('payroll-chart');
  payrollTrendCharts['payroll-chart']?.destroy?.();
  delete payrollTrendCharts['payroll-chart'];
  chart.removeAttribute('role');
  chart.removeAttribute('aria-label');
  chart.innerHTML = '<div class="payroll-dashboard-placeholder" role="status"><div class="spinner"></div><span>Loading payroll history...</span></div>';
  tbody.innerHTML = '<tr><td colspan="6"><div class="loading-state"><div class="spinner"></div></div></td></tr>';
  try {
    const rows = await api.get('/payroll/summary');
    if (requestId !== payrollSummaryRequest) return;
    renderPayrollTrend('payroll-chart', rows.slice().reverse());
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>No report data yet</h3><p>Completed payroll periods will appear here.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td><strong>${months[row.month - 1]} ${row.year}</strong></td>
        <td class="payroll-number">${row.employee_count}</td>
        <td class="payroll-number">${fmt.currency(row.total_base)}</td>
        <td class="payroll-number payroll-deduction-value">-${fmt.currency(row.total_deductions)}</td>
        <td class="payroll-number payroll-net-value">${fmt.currency(row.total_net)}</td>
        <td>${row.paid_count}/${row.employee_count} paid</td>
      </tr>`).join('');
  } catch (error) {
    if (requestId !== payrollSummaryRequest) return;
    chart.innerHTML = '<div class="payroll-chart-empty"><span>Report unavailable</span><small>Try opening reports again.</small></div>';
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Could not load reports</h3><p>${safe(error.message || 'Please try again shortly.')}</p></div></td></tr>`;
  }
}

async function showOvertimeRateModal() {
  const existing = document.getElementById('overtime-settings-modal');
  if (existing) {
    existing.querySelector('.modal-close')?.focus();
    return;
  }
  if (overtimeSettingsLoading) return;
  overtimeSettingsLoading = true;
  try {
    const settings = await api.get('/attendance/overtime/settings');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'overtime-settings-modal';
    overlay.innerHTML = `
      <div class="modal payroll-settings-modal" role="dialog" aria-modal="true" aria-labelledby="overtime-settings-title">
        <div class="modal-header">
          <div><h3 id="overtime-settings-title">Overtime settings</h3><p>Control the rate used during payroll.</p></div>
          <button class="modal-close" type="button" aria-label="Close overtime settings" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="payroll-edit-note">${payrollIcon('clock')}<span>Approved overtime is automatically included when payroll is processed.</span></div>
          <div class="form-group">
            <label class="form-label" for="overtime-hourly-rate">Hourly overtime rate (${fmt.currencyCode()})</label>
            <input id="overtime-hourly-rate" type="number" class="form-control" min="0" step="${fmt.currencyStep()}" value="${Number(settings.hourly_rate || 0)}">
          </div>
          <p class="form-hint">Employees are prompted for a reason after clocking out later than ${String(settings.late_clock_out_after || '17:30').slice(0, 5)}.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" type="button" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" type="button" onclick="saveOvertimeRate(this)">Save settings</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } catch (error) {
    toast(error.message || 'Could not load overtime settings', 'error');
  } finally {
    overtimeSettingsLoading = false;
  }
}
async function saveOvertimeRate(button) {
  try {
    await api.put('/attendance/overtime/settings', { hourly_rate: Number(document.getElementById('overtime-hourly-rate').value) });
    button.closest('.modal-overlay').remove(); toast('Overtime hourly rate saved', 'success');
  } catch (error) { toast(error.message || 'Could not save overtime rate', 'error'); }
}

document.getElementById('payroll-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll('[data-payroll-tab]')).filter((button) => button.style.display !== 'none');
  if (!tabs.length) return;
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
});

loadMyPayslips();
switchTab(user.role === 'admin' ? 'overview' : 'mine');

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
