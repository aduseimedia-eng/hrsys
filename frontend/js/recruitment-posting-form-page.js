const recruitmentPostingUser = initRecruitmentPlatform('postings');
if (!recruitmentPostingUser) throw new Error('redirect');

const postingId = new URLSearchParams(location.search).get('id');
const postingRequisitionId = new URLSearchParams(location.search).get('requisition_id');
let postingRequisitions = [];

function fillPostingOptions() {
  const select = document.getElementById('posting-requisition');
  select.innerHTML = '<option value="">Choose a requisition</option>' + postingRequisitions.map(item => `<option value="${item.id}">${recruitmentEscape(item.requisition_code || 'REQ')} · ${recruitmentEscape(item.title)}</option>`).join('');
}

function postingBody() {
  return {
    requisition_id: document.getElementById('posting-requisition').value,
    channel: document.getElementById('posting-channel').value,
    status: document.getElementById('posting-status').value,
    title: document.getElementById('posting-name').value,
    closes_at: document.getElementById('posting-close-date').value || null,
    external_url: document.getElementById('posting-external-url').value,
    summary: document.getElementById('posting-summary').value
  };
}

function fillPosting(posting) {
  document.getElementById('posting-requisition').value = posting.requisition_id || '';
  document.getElementById('posting-channel').value = posting.channel || 'internal';
  document.getElementById('posting-status').value = posting.status || 'draft';
  document.getElementById('posting-name').value = posting.title || '';
  document.getElementById('posting-close-date').value = posting.closes_at?.slice(0, 10) || '';
  document.getElementById('posting-external-url').value = posting.external_url || '';
  document.getElementById('posting-summary').value = posting.summary || '';
  document.getElementById('posting-title').textContent = posting.title || 'Job posting';
  document.getElementById('posting-topbar-title').textContent = posting.title || 'Job posting';
  document.getElementById('posting-copy').textContent = `${posting.requisition_code || 'Requisition'} · ${recruitmentStatusLabel(posting.status)}`;
}

document.getElementById('posting-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('posting-save');
  button.disabled = true;
  try {
    await (postingId ? api.put(`/recruitment/postings/${postingId}`, postingBody()) : api.post('/recruitment/postings', postingBody()));
    window.location.assign('recruitment-postings.html?saved=1');
  } catch (error) { recruitmentNotice(error.message || 'Could not save this job posting.', 'error'); }
  finally { button.disabled = false; }
});

async function initialisePostingForm() {
  const [requisitions, posting] = await Promise.all([
    api.get('/recruitment/requisitions?approval_status=approved'), postingId ? api.get(`/recruitment/postings/${postingId}`) : Promise.resolve(null)
  ]);
  postingRequisitions = (requisitions || []).filter(item => item.status !== 'closed');
  if (posting && !postingRequisitions.some(item => Number(item.id) === Number(posting.requisition_id))) postingRequisitions.push(posting);
  fillPostingOptions();
  if (posting) fillPosting(posting);
  else if (postingRequisitionId) document.getElementById('posting-requisition').value = postingRequisitionId;
}
initialisePostingForm().catch(error => recruitmentNotice(error.message || 'Could not load this job posting.', 'error'));
