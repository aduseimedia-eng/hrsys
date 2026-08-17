const recruitmentRequestUser = initRecruitmentPlatform('requests');
if (!recruitmentRequestUser) throw new Error('redirect');

const requestId = new URLSearchParams(location.search).get('id');
let currentRequest = null;
let requestDepartments = [];
let requestEmployees = [];
const requestForm = document.getElementById('request-form');

function setRequestOptions() {
  const department = document.getElementById('request-department');
  const manager = document.getElementById('request-manager');
  department.innerHTML = '<option value="">Not assigned</option>' + requestDepartments.map(item => `<option value="${item.id}">${recruitmentEscape(item.name)}</option>`).join('');
  manager.innerHTML = '<option value="">Not assigned</option>' + requestEmployees.map(item => `<option value="${item.id}">${recruitmentEscape(`${item.first_name} ${item.last_name}`)}</option>`).join('');
}

function requestBody() {
  return {
    title: document.getElementById('request-position').value,
    department_id: document.getElementById('request-department').value || null,
    hiring_manager_id: document.getElementById('request-manager').value || null,
    headcount: document.getElementById('request-headcount').value,
    employment_type: document.getElementById('request-type').value,
    location: document.getElementById('request-location').value,
    target_start_date: document.getElementById('request-target-date').value || null,
    justification: document.getElementById('request-justification').value,
    status: document.getElementById('request-save-status').value
  };
}

function setRequestEditable(editable) {
  requestForm.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(element => { element.disabled = !editable; });
  document.getElementById('request-save-status-group').hidden = !editable || Boolean(currentRequest);
}

function renderRequestWorkflow() {
  const target = document.getElementById('request-workflow');
  if (!currentRequest) { target.innerHTML = '<p>Create the request as a draft or submit it for review.</p>'; return; }
  const status = currentRequest.status;
  const history = (currentRequest.approvals || []).map(item => `<li><strong>${recruitmentStatusLabel(item.decision)}</strong><small>${recruitmentEscape(item.reviewer_name || 'Recruitment team')} · ${new Date(item.decided_at).toLocaleString()}${item.note ? ` · ${recruitmentEscape(item.note)}` : ''}</small></li>`).join('');
  const reviewerControls = status === 'submitted' ? `<label class="form-label" for="request-review-note" style="margin-top:14px">Review note</label><textarea id="request-review-note" class="form-control" rows="3" placeholder="Optional approval or rejection note"></textarea><div class="recruitment-form-actions" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="approve-request" type="button">Approve request</button><button class="btn btn-outline btn-sm" id="reject-request" type="button">Reject request</button></div>` : '';
  const submitControl = ['draft', 'rejected'].includes(status) ? '<button class="btn btn-primary btn-sm" id="submit-request" type="button" style="margin-top:14px">Submit for review</button>' : '';
  const convertControl = status === 'approved' ? '<a class="btn btn-primary btn-sm" id="convert-request" href="#" style="margin-top:14px">Create job requisition</a>' : '';
  target.innerHTML = `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>${reviewerControls}${submitControl}${convertControl}${history ? `<ul class="recruitment-timeline" style="margin-top:18px">${history}</ul>` : ''}`;
  target.querySelector('#submit-request')?.addEventListener('click', () => performRequestAction('submit'));
  target.querySelector('#approve-request')?.addEventListener('click', () => performRequestAction('approve'));
  target.querySelector('#reject-request')?.addEventListener('click', () => performRequestAction('reject'));
  target.querySelector('#convert-request')?.addEventListener('click', event => { event.preventDefault(); performRequestAction('convert'); });
}

async function performRequestAction(action) {
  const note = document.getElementById('request-review-note')?.value || '';
  try {
    const result = await api.post(`/recruitment/requests/${requestId}/${action}`, { note });
    if (action === 'convert') { window.location.assign(`recruitment-form.html?id=${result.id}&from_request=1`); return; }
    recruitmentNotice(`Request ${action === 'submit' ? 'submitted for review' : action === 'approve' ? 'approved' : 'rejected'}.`, 'success');
    await loadRequest();
  } catch (error) { recruitmentNotice(error.message || 'Could not update this request.', 'error'); }
}

function fillRequest(request) {
  document.getElementById('request-position').value = request.title || '';
  document.getElementById('request-department').value = request.department_id || '';
  document.getElementById('request-manager').value = request.hiring_manager_id || '';
  document.getElementById('request-headcount').value = request.headcount || 1;
  document.getElementById('request-type').value = request.employment_type || 'staff';
  document.getElementById('request-location').value = request.location || '';
  document.getElementById('request-target-date').value = request.target_start_date?.slice(0, 10) || '';
  document.getElementById('request-justification').value = request.justification || '';
  document.getElementById('request-title').textContent = request.request_number || 'Recruitment request';
  document.getElementById('request-topbar-title').textContent = request.request_number || 'Recruitment request';
  document.getElementById('request-copy').textContent = `${request.title} · ${recruitmentStatusLabel(request.status)}`;
  setRequestEditable(['draft', 'rejected'].includes(request.status));
  renderRequestWorkflow();
}

async function loadRequest() {
  currentRequest = await api.get(`/recruitment/requests/${requestId}`);
  fillRequest(currentRequest);
}

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('request-save');
  button.disabled = true;
  try {
    const result = requestId ? await api.put(`/recruitment/requests/${requestId}`, requestBody()) : await api.post('/recruitment/requests', requestBody());
    if (!requestId) { window.location.assign(`recruitment-request-form.html?id=${result.id}&saved=1`); return; }
    recruitmentNotice('Recruitment request saved.', 'success');
    await loadRequest();
  } catch (error) { recruitmentNotice(error.message || 'Could not save this request.', 'error'); }
  finally { button.disabled = false; }
});

async function initialiseRequestForm() {
  const [departments, employees] = await Promise.all([api.get('/employees/departments'), api.get('/employees/directory')]);
  requestDepartments = departments || [];
  requestEmployees = employees || [];
  setRequestOptions();
  if (requestId) await loadRequest();
  if (new URLSearchParams(location.search).get('saved') === '1') recruitmentNotice('Recruitment request saved.', 'success');
}
initialiseRequestForm().catch(error => recruitmentNotice(error.message || 'Could not load this request.', 'error'));
