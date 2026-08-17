const recruitmentFormUser = requireAuth();
if (!recruitmentFormUser) throw new Error('redirect');
buildSidebar('recruitment');
const recruitmentParams = new URLSearchParams(location.search);
const recruitmentId = recruitmentParams.get('id');
const formMode = recruitmentParams.get('mode') || 'request';
const form = document.getElementById('recruitment-form');
function defaultStatus() { return formMode === 'posting' ? 'open' : 'draft'; }
function returnToRecruitment() { if (window.self !== window.top) window.parent.postMessage({ type: 'hrconnect:navigate', route: 'recruitment' }, window.location.origin); else window.location.href = adminWorkspaceUrl('recruitment'); }
async function loadForm() {
  if (!recruitmentId) { document.getElementById('job-status').value = defaultStatus(); return; }
  const jobs = await api.get('/recruitment/jobs'); const job = jobs.find(item => String(item.id) === String(recruitmentId));
  if (!job) { toast('Recruitment not found', 'error'); returnToRecruitment(); return; }
  document.getElementById('topbar-title').textContent = 'Edit recruitment'; document.getElementById('form-title').textContent = 'Edit recruitment'; document.getElementById('form-copy').textContent = 'Update the role or close the posting when recruitment is complete.';
  document.getElementById('job-title').value = job.title || ''; document.getElementById('job-location').value = job.location || ''; document.getElementById('job-type').value = job.employment_type || 'staff'; document.getElementById('job-status').value = job.status || 'draft'; document.getElementById('job-close').value = job.closes_at?.slice(0, 10) || ''; document.getElementById('job-description').value = job.description || ''; document.getElementById('danger-area').hidden = false;
}
form.addEventListener('submit', async event => { event.preventDefault(); const data = { title: document.getElementById('job-title').value, location: document.getElementById('job-location').value, employment_type: document.getElementById('job-type').value, status: document.getElementById('job-status').value, closes_at: document.getElementById('job-close').value, description: document.getElementById('job-description').value }; try { if (recruitmentId) await api.put(`/recruitment/jobs/${recruitmentId}`, data); else await api.post('/recruitment/jobs', data); toast('Recruitment saved', 'success'); returnToRecruitment(); } catch (error) { toast(error.message, 'error'); } });
function showDeleteConfirmation() { document.getElementById('delete-start').hidden = true; document.getElementById('delete-confirm').classList.add('visible'); }
function hideDeleteConfirmation() { document.getElementById('delete-start').hidden = false; document.getElementById('delete-confirm').classList.remove('visible'); }
async function deleteRecruitment() { try { await api.delete(`/recruitment/jobs/${recruitmentId}`); toast('Recruitment deleted', 'success'); returnToRecruitment(); } catch (error) { toast(error.message, 'error'); } }
loadForm().catch(error => toast(error.message, 'error'));
