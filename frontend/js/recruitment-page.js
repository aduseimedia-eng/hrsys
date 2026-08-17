const recruitmentDashboardUser = initRecruitmentPlatform('dashboard');
if (!recruitmentDashboardUser) throw new Error('redirect');

const dashboardNumber = value => Number(value) || 0;
const dashboardDate = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const dashboardPill = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;

function dashboardQueueLink(item) {
  if (item.type === 'request') return `recruitment-request-form.html?id=${item.id}`;
  if (item.type === 'requisition') return `recruitment-form.html?id=${item.id}`;
  return `candidate.html?id=${item.id}`;
}

function renderQueue(queue) {
  const target = document.getElementById('work-queue');
  if (!queue.length) {
    target.innerHTML = '<li class="recruitment-empty"><strong>Your queue is clear.</strong>Submitted requests and approval tasks will appear here.</li>';
    return;
  }
  target.innerHTML = queue.map(item => `<li><a class="recruitment-list__item recruitment-list__item--link" href="${dashboardQueueLink(item)}"><span><strong>${recruitmentEscape(item.title)}</strong><small>${item.type === 'interview' ? `Interview ${dashboardDate(item.scheduled_at)}` : `${recruitmentStatusLabel(item.status)} ${item.type}`}</small></span>${dashboardPill(item.status)}</a></li>`).join('');
}

function renderInterviews(interviews) {
  const target = document.getElementById('upcoming-interviews');
  if (!interviews.length) {
    target.innerHTML = '<li class="recruitment-empty"><strong>No interviews scheduled.</strong>Schedule one from a candidate profile.</li>';
    return;
  }
  target.innerHTML = interviews.map(interview => `<li><a class="recruitment-list__item recruitment-list__item--link" href="candidate.html?id=${interview.application_id || interview.id}"><span><strong>${recruitmentEscape(interview.candidate_name)}</strong><small>${recruitmentEscape(interview.requisition_title || 'Recruitment')} · ${dashboardDate(interview.scheduled_at)}</small></span>${dashboardPill('scheduled')}</a></li>`).join('');
}

function renderPipeline(stages, report) {
  const counts = new Map((report.by_stage || []).map(item => [item.status, dashboardNumber(item.count)]));
  const total = dashboardNumber(report.summary?.applicants);
  document.getElementById('pipeline-summary').innerHTML = stages.length ? stages.map(stage => {
    const count = counts.get(stage.stage_key) || 0;
    const share = total ? `${Math.round((count / total) * 100)}%` : '0%';
    return `<tr><td><strong>${recruitmentEscape(stage.name)}</strong></td><td>${count}</td><td>${share}</td><td><a class="btn btn-outline btn-sm" href="applications.html?stage=${encodeURIComponent(stage.stage_key)}">View candidates</a></td></tr>`;
  }).join('') : '<tr><td colspan="4" class="recruitment-empty">No stages have been configured.</td></tr>';
}

async function loadRecruitmentDashboard() {
  const [overview, report, stages] = await Promise.all([
    api.get('/recruitment/overview'), api.get('/recruitment/report'), api.get('/recruitment/stages')
  ]);
  document.getElementById('metric-requests').textContent = dashboardNumber(overview.requests?.awaiting_review);
  document.getElementById('metric-requisitions').textContent = dashboardNumber(overview.requisitions?.awaiting_approval);
  document.getElementById('metric-postings').textContent = dashboardNumber(overview.postings?.published);
  document.getElementById('metric-candidates').textContent = dashboardNumber(overview.candidates?.active);
  renderQueue(overview.queue || []);
  renderInterviews(report.upcoming_interviews || []);
  renderPipeline(stages, report);
}

loadRecruitmentDashboard().catch(error => recruitmentNotice(error.message || 'Could not load the recruitment dashboard.', 'error'));
