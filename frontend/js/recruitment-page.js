const recruitmentDashboardUser = initRecruitmentPlatform('dashboard');
if (!recruitmentDashboardUser) throw new Error('redirect');

const dashboardNumber = value => Number(value) || 0;
const dashboardDate = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const dashboardPill = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;

function dashboardQueueIcon(type) {
  const icons = { request: 'request', requisition: 'requisition', interview: 'interview' };
  return recruitmentIcon(icons[type] || 'candidate', 'recruitment-list-icon');
}

function dashboardStageIcon(stage) {
  const key = String(stage || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const icons = {
    application: 'application', applications: 'application', applied: 'application',
    screening: 'search', reviewing: 'search',
    shortlist: 'star', shortlisting: 'star', shortlisted: 'star',
    assessment: 'request', assessments: 'request',
    interview: 'interview', interviews: 'interview',
    reference_check: 'shield', reference_checks: 'shield',
    selection: 'target', selected: 'target',
    offer: 'offer', offers: 'offer', acceptance: 'offer', offer_acceptance: 'offer',
    pre_employment: 'shield', onboarding: 'candidate', hired: 'candidate',
    rejected: 'x', withdrawn: 'x'
  };
  return recruitmentIcon(icons[key] || 'pipeline', 'recruitment-stage-icon');
}

function dashboardQueueLink(item) {
  if (item.type === 'requisition') return `recruitment-form.html?id=${item.id}`;
  return `candidate.html?id=${item.id}`;
}

function renderQueue(queue) {
  const target = document.getElementById('work-queue');
  target.setAttribute('aria-busy', 'false');
  if (!queue.length) {
    target.innerHTML = '<li class="recruitment-empty"><strong>Your queue is clear.</strong>Requisition approvals and scheduled interviews will appear here.</li>';
    return;
  }
  target.innerHTML = queue.map(item => `<li><a class="recruitment-list__item recruitment-list__item--link" href="${dashboardQueueLink(item)}"><span class="recruitment-list__identity">${dashboardQueueIcon(item.type)}<span class="recruitment-list__identity-copy"><strong>${recruitmentEscape(item.title)}</strong><small>${item.type === 'interview' ? `Interview ${dashboardDate(item.scheduled_at)}` : `${recruitmentStatusLabel(item.status)} ${item.type}`}</small></span></span>${dashboardPill(item.status)}</a></li>`).join('');
}

function renderInterviews(interviews) {
  const target = document.getElementById('upcoming-interviews');
  target.setAttribute('aria-busy', 'false');
  if (!interviews.length) {
    target.innerHTML = '<li class="recruitment-empty"><strong>No interviews scheduled.</strong>Schedule one from a candidate profile.</li>';
    return;
  }
  target.innerHTML = interviews.map(interview => `<li><a class="recruitment-list__item recruitment-list__item--link" href="candidate.html?id=${interview.application_id || interview.id}"><span class="recruitment-list__identity">${recruitmentIcon('interview', 'recruitment-list-icon')}<span class="recruitment-list__identity-copy"><strong>${recruitmentEscape(interview.candidate_name)}</strong><small>${recruitmentEscape(interview.requisition_title || 'Recruitment')} · ${dashboardDate(interview.scheduled_at)}</small></span></span>${dashboardPill('scheduled')}</a></li>`).join('');
}

function renderPipeline(stages, report) {
  const counts = new Map((report.by_stage || []).map(item => [item.status, dashboardNumber(item.count)]));
  const total = dashboardNumber(report.summary?.applicants);
  const target = document.getElementById('pipeline-summary');
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = stages.length ? stages.map(stage => {
    const count = counts.get(stage.stage_key) || 0;
    const share = total ? `${Math.round((count / total) * 100)}%` : '0%';
    return `<tr><td><span class="recruitment-stage-cell">${dashboardStageIcon(stage.stage_key)}<strong>${recruitmentEscape(stage.name)}</strong></span></td><td>${count}</td><td>${share}</td><td><a class="btn btn-outline btn-sm" href="applications.html?stage=${encodeURIComponent(stage.stage_key)}"><span>View candidates</span>${recruitmentIcon('arrow_right', 'recruitment-action-icon recruitment-action-icon--forward')}</a></td></tr>`;
  }).join('') : '<tr><td colspan="4" class="recruitment-empty">No stages have been configured.</td></tr>';
}

async function loadRecruitmentDashboard() {
  const [overview, report, stages] = await Promise.all([
    api.get('/recruitment/overview'), api.get('/recruitment/report'), api.get('/recruitment/stages')
  ]);
  document.getElementById('metric-requests').textContent = dashboardNumber(overview.requisitions?.open);
  document.getElementById('metric-requisitions').textContent = dashboardNumber(overview.requisitions?.awaiting_approval);
  document.getElementById('metric-postings').textContent = dashboardNumber(overview.postings?.published);
  document.getElementById('metric-candidates').textContent = dashboardNumber(overview.candidates?.active);
  renderQueue((overview.queue || []).filter(item => item.type !== 'request'));
  renderInterviews(report.upcoming_interviews || []);
  renderPipeline(stages, report);
}

loadRecruitmentDashboard().catch(error => {
  ['work-queue', 'upcoming-interviews', 'pipeline-summary'].forEach((id) => {
    document.getElementById(id)?.setAttribute('aria-busy', 'false');
  });
  recruitmentNotice(error.message || 'Could not load the recruitment dashboard.', 'error');
});
