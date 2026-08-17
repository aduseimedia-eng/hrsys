const recruitmentApplicationsUser = initRecruitmentPlatform('applications');
if (!recruitmentApplicationsUser) throw new Error('redirect');

let recruitmentApplications = [];
let recruitmentStages = [];
const selectedStage = new URLSearchParams(location.search).get('stage');
const selectedRequisition = new URLSearchParams(location.search).get('requisition_id');

function applicationStageBadge(status) {
  return `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStageLabel(status)}</span>`;
}

function renderApplications() {
  const query = document.getElementById('candidate-search').value.trim().toLowerCase();
  const stage = document.getElementById('candidate-stage-filter').value;
  const filtered = recruitmentApplications.filter(item => {
    const searchText = `${item.full_name || ''} ${item.email || ''} ${item.requisition_title || ''} ${item.role_applied || ''}`.toLowerCase();
    return (!stage || item.status === stage) && (!selectedRequisition || String(item.requisition_id) === String(selectedRequisition)) && (!query || searchText.includes(query));
  });
  document.getElementById('candidate-rows').innerHTML = filtered.length ? filtered.map(item => `<tr>
    <td><strong>${recruitmentEscape(item.full_name)}</strong><br><small>${recruitmentEscape(item.email)}</small></td>
    <td>${recruitmentEscape(item.requisition_title || item.role_applied || 'General application')}</td><td>${fmt.date(item.submitted_at)}</td>
    <td>${applicationStageBadge(item.status)}</td><td>${item.rating ? `${item.rating} / 5` : '—'}</td>
    <td><a class="btn btn-outline btn-sm" href="candidate.html?id=${item.id}">Open profile</a></td>
  </tr>`).join('') : '<tr><td colspan="6" class="recruitment-empty"><strong>No candidates match these filters.</strong>Try another stage or search term.</td></tr>';
}

async function loadApplications() {
  [recruitmentApplications, recruitmentStages] = await Promise.all([api.get('/recruitment/applications'), api.get('/recruitment/stages')]);
  const stageSelect = document.getElementById('candidate-stage-filter');
  stageSelect.innerHTML = '<option value="">All stages</option>' + recruitmentStages.map(stage => `<option value="${recruitmentEscape(stage.stage_key)}">${recruitmentEscape(stage.name)}</option>`).join('');
  if (selectedStage) stageSelect.value = selectedStage;
  if (selectedRequisition) document.querySelector('.recruitment-page-header p').textContent = 'Candidates attached to this job requisition.';
  renderApplications();
}
document.getElementById('candidate-search').addEventListener('input', renderApplications);
document.getElementById('candidate-stage-filter').addEventListener('change', renderApplications);
loadApplications().catch(error => recruitmentNotice(error.message || 'Could not load candidate applications.', 'error'));
