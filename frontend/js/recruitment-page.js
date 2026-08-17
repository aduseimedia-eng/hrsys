const recruitmentUser = requireAuth();
if (!recruitmentUser) throw new Error('redirect');
buildSidebar('recruitment');
loadNotifCount();

let recruitmentJobs = [], recruitmentStages = [], recruitmentReport = null;
const escapeRecruitment = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const asNumber = value => Number(value) || 0;
const stageCount = key => asNumber(recruitmentReport?.by_stage?.find(stage => stage.status === key)?.count);
const percentage = (part, total) => total ? `${Math.round((part / total) * 100)}%` : '0%';

async function loadRecruitmentDashboard() {
  [recruitmentJobs, recruitmentStages, recruitmentReport] = await Promise.all([
    api.get('/recruitment/jobs'), api.get('/recruitment/stages'), api.get('/recruitment/report')
  ]);
  renderRecruitmentDashboard();
}
function renderRecruitmentDashboard() {
  const summary = recruitmentReport.summary || {}, vacancies = recruitmentReport.vacancies || {}, offers = recruitmentReport.offers || {};
  const applicants = asNumber(summary.applicants), hired = asNumber(summary.hired), totalVacancies = asNumber(vacancies.total), ongoing = asNumber(vacancies.ongoing), acceptedOffers = asNumber(offers.accepted), totalOffers = asNumber(offers.total);
  document.getElementById('dashboard-date').textContent = new Intl.DateTimeFormat(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' }).format(new Date());
  document.getElementById('metric-vacancies').textContent = totalVacancies;
  document.getElementById('metric-ongoing').textContent = ongoing;
  document.getElementById('metric-hired').textContent = hired;
  document.getElementById('metric-hired-copy').textContent = `Of ${applicants} candidate${applicants === 1 ? '' : 's'}`;
  document.getElementById('metric-conversion').textContent = percentage(hired, applicants);
  document.getElementById('metric-acceptance').textContent = percentage(acceptedOffers, totalOffers);
  const maxStageCount = Math.max(1, ...recruitmentStages.map(stage => stageCount(stage.stage_key)));
  document.getElementById('pipeline-list').innerHTML = recruitmentStages.length ? recruitmentStages.map(stage => { const count=stageCount(stage.stage_key), width=count ? Math.max(4,Math.round((count/maxStageCount)*100)) : 0; return `<a class="pipeline-row" href="applications.html?stage=${encodeURIComponent(stage.stage_key)}"><span class="pipeline-label">${escapeRecruitment(stage.name)}</span><span class="pipeline-track"><span class="pipeline-fill" style="width:${width}%"></span></span><span class="pipeline-count">${count}</span></a>`; }).join('') : '<div class="empty-state"><p>No recruitment stages yet.</p></div>';
  const interviews = recruitmentReport.upcoming_interviews || [];
  document.getElementById('interview-list').innerHTML = interviews.length ? interviews.map(interview => { const date=new Date(interview.scheduled_at); return `<a class="interview-item" href="applications.html"><span class="interview-date">${date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span class="interview-copy"><strong>${escapeRecruitment(interview.candidate_name)}</strong><span>${escapeRecruitment(interview.requisition_title || 'Recruitment')} ${interview.meeting_location ? `· ${escapeRecruitment(interview.meeting_location)}` : ''}</span></span><span class="interview-time">${date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></a>`; }).join('') : '<div class="empty-state"><p>No upcoming interviews.</p></div>';
  const openJobs = recruitmentJobs.filter(job => job.status === 'open');
  document.getElementById('recruitment-count').textContent = `${openJobs.length} active role${openJobs.length === 1 ? '' : 's'}`;
  document.getElementById('recruitment-list').innerHTML = openJobs.length ? openJobs.map(job => `<article class="recruitment-item"><div><h3>${escapeRecruitment(job.title)}</h3><p>${escapeRecruitment(job.location || 'Location not set')} · ${escapeRecruitment(job.employment_type || 'Employment type not set')}</p><small>${job.applicant_count} candidate${Number(job.applicant_count) === 1 ? '' : 's'}${job.closes_at ? ` · Closes ${fmt.date(job.closes_at)}` : ''}</small></div><div class="recruitment-item-actions"><a class="btn btn-outline btn-sm" href="recruitment-candidates.html?id=${job.id}">Candidates</a><a class="btn btn-outline btn-sm" href="recruitment-form.html?id=${job.id}">Edit</a></div></article>`).join('') : '<div class="empty-state"><p>No open recruitments yet.</p></div>';
  document.getElementById('stage-list').innerHTML = recruitmentStages.map(stage => `<a class="stage-link" href="applications.html?stage=${encodeURIComponent(stage.stage_key)}"><span>${escapeRecruitment(stage.name)}</span><b>${stageCount(stage.stage_key)}</b></a>`).join('');
}
function openStageModal() { document.getElementById('stage-name').value = ''; document.getElementById('stage-modal').style.display = 'flex'; document.getElementById('stage-name').focus(); }
function closeStageModal() { document.getElementById('stage-modal').style.display = 'none'; }
async function saveStage() { try { await api.post('/recruitment/stages', { name: document.getElementById('stage-name').value }); closeStageModal(); toast('Stage added', 'success'); await loadRecruitmentDashboard(); } catch (error) { toast(error.message, 'error'); } }
async function copyApplicationLink() { try { const data = await api.get('/recruitment/application-link'); await navigator.clipboard.writeText(`${location.origin}/pages/apply.html?company=${encodeURIComponent(data.slug)}`); toast('Application link copied', 'success'); } catch (error) { toast(error.message, 'error'); } }
loadRecruitmentDashboard().catch(error => toast(error.message, 'error'));
