const recruitmentRequisitionUser = initRecruitmentPlatform('requisitions');
if (!recruitmentRequisitionUser) throw new Error('redirect');

const requisitionId = new URLSearchParams(location.search).get('id');
let currentRequisition = null;
let requisitionDepartments = [];
let requisitionEmployees = [];
const requisitionForm = document.getElementById('requisition-form');

function setRequisitionOptions() {
  document.getElementById('requisition-department').innerHTML = '<option value="">Not assigned</option>' + requisitionDepartments.map(item => `<option value="${item.id}">${recruitmentEscape(item.name)}</option>`).join('');
  document.getElementById('requisition-manager').innerHTML = '<option value="">Not assigned</option>' + requisitionEmployees.map(item => `<option value="${item.id}">${recruitmentEscape(`${item.first_name} ${item.last_name}`)}</option>`).join('');
}

function requisitionBody() {
  return {
    title: document.getElementById('requisition-position').value,
    request_id: document.getElementById('requisition-request-id').value || null,
    department_id: document.getElementById('requisition-department').value || null,
    hiring_manager_id: document.getElementById('requisition-manager').value || null,
    headcount: document.getElementById('requisition-headcount').value,
    employment_type: document.getElementById('requisition-type').value,
    location: document.getElementById('requisition-location').value,
    closes_at: document.getElementById('requisition-close-date').value || null,
    target_start_date: document.getElementById('requisition-start-date').value || null,
    description: document.getElementById('requisition-description').value,
    approval_status: document.getElementById('requisition-save-status').value
  };
}

function setRequisitionEditable(editable) {
  requisitionForm.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(element => { element.disabled = !editable; });
  document.getElementById('requisition-save-status-group').hidden = !editable || Boolean(currentRequisition);
}

function renderRequisitionWorkflow() {
  const target = document.getElementById('requisition-workflow');
  if (!currentRequisition) { target.innerHTML = '<p>Create the requisition as a draft or submit it for approval.</p>'; return; }
  const approval = currentRequisition.approval_status;
  const status = currentRequisition.status;
  const review = approval === 'pending' ? `<label class="form-label" for="requisition-approval-note" style="margin-top:14px">Approval note</label><textarea id="requisition-approval-note" class="form-control" rows="3" placeholder="Optional approval or rejection note"></textarea><div class="recruitment-form-actions" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="approve-requisition" type="button">Approve requisition</button><button class="btn btn-outline btn-sm" id="reject-requisition" type="button">Reject requisition</button></div>` : '';
  const submit = ['draft', 'rejected'].includes(approval) ? '<button class="btn btn-primary btn-sm" id="submit-requisition" type="button" style="margin-top:14px">Submit for approval</button>' : '';
  const post = approval === 'approved' && status !== 'closed' ? `<a class="btn btn-primary btn-sm" href="recruitment-posting-form.html?requisition_id=${currentRequisition.id}" style="margin-top:14px">Create job posting</a>` : '';
  const close = status !== 'closed' && approval === 'approved' ? '<button class="btn btn-outline btn-sm" id="close-requisition" type="button" style="margin-top:10px">Close requisition</button>' : '';
  target.innerHTML = `<span class="recruitment-status recruitment-status--${recruitmentEscape(approval)}">${recruitmentStatusLabel(approval)}</span><p style="margin-top:8px">Lifecycle: ${recruitmentStatusLabel(status)}</p>${review}${submit}${post}${close}`;
  target.querySelector('#submit-requisition')?.addEventListener('click', () => performRequisitionAction('submit'));
  target.querySelector('#approve-requisition')?.addEventListener('click', () => performRequisitionAction('approve'));
  target.querySelector('#reject-requisition')?.addEventListener('click', () => performRequisitionAction('reject'));
  target.querySelector('#close-requisition')?.addEventListener('click', () => performRequisitionAction('close'));
}

async function performRequisitionAction(action) {
  const note = document.getElementById('requisition-approval-note')?.value || '';
  try {
    await api.post(`/recruitment/requisitions/${requisitionId}/${action}`, { note });
    recruitmentNotice(`Requisition ${action === 'submit' ? 'submitted for approval' : action}.`, 'success');
    await loadRequisition();
  } catch (error) { recruitmentNotice(error.message || 'Could not update this requisition.', 'error'); }
}

function fillRequisition(item) {
  document.getElementById('requisition-position').value = item.title || '';
  document.getElementById('requisition-request-id').value = item.request_id || '';
  document.getElementById('requisition-department').value = item.department_id || '';
  document.getElementById('requisition-manager').value = item.hiring_manager_id || '';
  document.getElementById('requisition-headcount').value = item.headcount || 1;
  const employmentType = item.employment_type || 'full-time';
  const employmentTypeField = document.getElementById('requisition-type');
  employmentTypeField.value = Array.from(employmentTypeField.options).some(option => option.value === employmentType) ? employmentType : 'full-time';
  document.getElementById('requisition-location').value = item.location || '';
  document.getElementById('requisition-close-date').value = item.closes_at?.slice(0, 10) || '';
  document.getElementById('requisition-start-date').value = item.target_start_date?.slice(0, 10) || '';
  document.getElementById('requisition-description').value = item.description || '';
  document.getElementById('requisition-title').textContent = item.requisition_code || 'Job requisition';
  document.getElementById('requisition-topbar-title').textContent = item.requisition_code || 'Job requisition';
  document.getElementById('requisition-copy').textContent = `${item.title} · ${recruitmentStatusLabel(item.approval_status)}`;
  setRequisitionEditable(item.status !== 'closed');
  renderRequisitionWorkflow();
}

async function loadRequisition() {
  currentRequisition = await api.get(`/recruitment/requisitions/${requisitionId}`);
  fillRequisition(currentRequisition);
}

requisitionForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('requisition-save');
  button.disabled = true;
  try {
    const result = requisitionId ? await api.put(`/recruitment/requisitions/${requisitionId}`, requisitionBody()) : await api.post('/recruitment/requisitions', requisitionBody());
    if (!requisitionId) { window.location.assign(`recruitment-form.html?id=${result.id}&saved=1`); return; }
    recruitmentNotice('Job requisition saved.', 'success');
    await loadRequisition();
  } catch (error) { recruitmentNotice(error.message || 'Could not save this requisition.', 'error'); }
  finally { button.disabled = false; }
});

async function initialiseRequisitionForm() {
  const [departments, employees] = await Promise.all([api.get('/employees/departments'), api.get('/employees/directory')]);
  requisitionDepartments = departments || [];
  requisitionEmployees = employees || [];
  setRequisitionOptions();
  if (requisitionId) await loadRequisition();
  if (new URLSearchParams(location.search).get('saved') === '1') recruitmentNotice('Job requisition saved.', 'success');
}
initialiseRequisitionForm().catch(error => recruitmentNotice(error.message || 'Could not load this requisition.', 'error'));
