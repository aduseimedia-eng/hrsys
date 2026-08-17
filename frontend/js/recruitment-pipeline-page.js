const recruitmentPipelineUser = initRecruitmentPlatform('pipeline');
if (!recruitmentPipelineUser) throw new Error('redirect');

let pipelineRequisitions = [];
function renderPipelineBoard(data) {
  const grouped = new Map(data.stages.map(stage => [stage.stage_key, []]));
  data.applications.forEach(application => {
    if (!grouped.has(application.status)) grouped.set(application.status, []);
    grouped.get(application.status).push(application);
  });
  document.getElementById('pipeline-board').innerHTML = data.stages.map(stage => {
    const candidates = grouped.get(stage.stage_key) || [];
    return `<section class="recruitment-board__column"><header class="recruitment-board__heading"><span>${recruitmentEscape(stage.name)}</span><span class="recruitment-board__count">${candidates.length}</span></header><div class="recruitment-board__cards">${candidates.length ? candidates.map(candidate => `<a class="recruitment-board-card" href="candidate.html?id=${candidate.id}"><strong>${recruitmentEscape(candidate.full_name)}</strong><small>${recruitmentEscape(candidate.requisition_title || 'General application')}</small><small>${candidate.rating ? `${candidate.rating} / 5 rating` : 'Not rated'} · Applied ${fmt.date(candidate.submitted_at)}</small></a>`).join('') : '<div class="recruitment-empty">No candidates</div>'}</div></section>`;
  }).join('');
}

async function loadPipeline() {
  const requisitionId = document.getElementById('pipeline-requisition').value;
  const data = await api.get(`/recruitment/pipeline${requisitionId ? `?requisition_id=${encodeURIComponent(requisitionId)}` : ''}`);
  renderPipelineBoard(data);
}

async function initialisePipeline() {
  pipelineRequisitions = await api.get('/recruitment/requisitions');
  document.getElementById('pipeline-requisition').innerHTML = '<option value="">All requisitions</option>' + pipelineRequisitions.map(item => `<option value="${item.id}">${recruitmentEscape(item.requisition_code || 'REQ')} · ${recruitmentEscape(item.title)}</option>`).join('');
  await loadPipeline();
}
document.getElementById('pipeline-requisition').addEventListener('change', () => loadPipeline().catch(error => recruitmentNotice(error.message, 'error')));
initialisePipeline().catch(error => recruitmentNotice(error.message || 'Could not load the candidate pipeline.', 'error'));
