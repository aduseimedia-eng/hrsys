// Internal jobs are a staff-only page.  `requireAuth` is for the HR/admin
// workspace and clears an employee session, so use the staff guard here.
const internalJobsUser = requireStaffAuth();
if (!internalJobsUser) throw new Error('redirect');
const internalJobsAllowed = internalJobsUser.role === 'employee';
if (!internalJobsAllowed) window.location.replace(adminWorkspaceUrl('recruitment'));
if (internalJobsAllowed) { buildSidebar('internal-jobs'); loadNotifCount(); }
const escapeInternalJobs = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
async function loadInternalJobs() {
  const [jobs, applications] = await Promise.all([api.get('/recruitment/internal/jobs'), api.get('/recruitment/internal/applications')]);
  document.getElementById('jobs-count').textContent = `${jobs.length} open opportunit${jobs.length === 1 ? 'y' : 'ies'}`;
  document.getElementById('jobs-list').innerHTML = jobs.length ? jobs.map(job => `<article class="internal-job"><h3>${escapeInternalJobs(job.title)}</h3><div class="internal-job-meta"><span>${escapeInternalJobs(job.location || 'Location not set')}</span><span>${escapeInternalJobs(job.employment_type || 'Employment type not set')}</span>${job.closes_at ? `<span>Closes ${fmt.date(job.closes_at)}</span>` : ''}</div><p>${escapeInternalJobs(job.description || 'No job description has been added yet.')}</p><div class="internal-job-footer"><small>Internal applications are confidential to the recruitment team.</small><a class="btn btn-primary btn-sm" href="internal-job-apply.html?id=${job.id}">Apply</a></div></article>`).join('') : '<div class="empty-state"><p>There are no open internal jobs right now.</p></div>';
  document.getElementById('my-applications').innerHTML = applications.length ? applications.map(application => `<a class="my-application" href="internal-job-apply.html?id=${application.requisition_id}"><strong>${escapeInternalJobs(application.title || 'Recruitment')}</strong><small>${escapeInternalJobs(application.status)} · Applied ${fmt.date(application.submitted_at)}</small></a>`).join('') : '<div class="empty-state"><p>You have not submitted an internal application yet.</p></div>';
  if (new URLSearchParams(location.search).get('submitted') === '1') toast('Your internal application was submitted', 'success');
}
if (internalJobsAllowed) loadInternalJobs().catch(error => toast(error.message, 'error'));
