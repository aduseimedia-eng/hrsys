// Keep the employee's session while they move from the staff portal to an
// internal vacancy and its application form.
const internalApplyUser = requireStaffAuth();
if (!internalApplyUser) throw new Error('redirect');
const internalApplyAllowed = internalApplyUser.role === 'employee';
if (!internalApplyAllowed) window.location.replace(adminWorkspaceUrl('recruitment'));
if (internalApplyAllowed) buildSidebar('internal-jobs');
const internalJobId = new URLSearchParams(location.search).get('id');
let internalJob = null;
async function loadInternalJob() {
  if (!internalJobId) return window.location.replace(appUrl('/pages/internal-jobs.html'));
  const jobs = await api.get('/recruitment/internal/jobs'); internalJob = jobs.find(job => String(job.id) === String(internalJobId));
  if (!internalJob) { toast('This internal job is no longer open', 'error'); window.location.replace(appUrl('/pages/internal-jobs.html')); return; }
  document.getElementById('requisition-id').value = internalJob.id; document.getElementById('job-title').textContent = internalJob.title; document.getElementById('job-context').textContent = `${internalJob.location || 'Location not set'} · ${internalJob.employment_type || 'Employment type not set'}`; document.getElementById('job-meta').innerHTML = `<span>${internalJob.location || 'Location not set'}</span><span>${internalJob.employment_type || 'Employment type not set'}</span>${internalJob.closes_at ? `<span>Closing date: ${fmt.date(internalJob.closes_at)}</span>` : ''}`; document.getElementById('job-description').textContent = internalJob.description || 'No job description has been added yet.';
}
document.getElementById('internal-application-form').addEventListener('submit', async event => { event.preventDefault(); const button=document.getElementById('submit-application'); button.disabled=true; button.textContent='Submitting…'; try { const body=new FormData(); body.append('requisition_id',document.getElementById('requisition-id').value); body.append('cover_note',document.getElementById('cover-note').value); for(const file of document.getElementById('application-documents').files) body.append('documents',file); const response=await fetch(`${API_BASE}/recruitment/internal/apply`,{method:'POST',headers:{Authorization:`Bearer ${api.getToken()}`},body}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||'Could not submit your application'); window.location.assign(appUrl('/pages/internal-jobs.html?submitted=1')); } catch(error) { toast(error.message,'error'); button.disabled=false; button.textContent='Submit application'; } });
if (internalApplyAllowed) loadInternalJob().catch(error=>toast(error.message,'error'));
