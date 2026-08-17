const recruitmentInterviewFormUser = initRecruitmentPlatform('interviews');
if (!recruitmentInterviewFormUser) throw new Error('redirect');

const interviewCandidateId = new URLSearchParams(location.search).get('application_id');
function optionText(item) { return `${item.full_name} · ${item.requisition_title || item.role_applied || 'General application'}`; }

document.getElementById('interview-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('interview-save');
  button.disabled = true;
  try {
    const applicationId = document.getElementById('interview-candidate').value;
    await api.post(`/recruitment/applications/${applicationId}/interviews`, {
      interviewer_id: document.getElementById('interview-interviewer').value || null,
      scheduled_at: document.getElementById('interview-time').value,
      duration_minutes: document.getElementById('interview-duration').value,
      meeting_location: document.getElementById('interview-location').value
    });
    window.location.assign('recruitment-interviews.html?saved=1');
  } catch (error) { recruitmentNotice(error.message || 'Could not schedule this interview.', 'error'); }
  finally { button.disabled = false; }
});

async function initialiseInterviewForm() {
  const [applications, employees] = await Promise.all([api.get('/recruitment/applications'), api.get('/employees/directory')]);
  document.getElementById('interview-candidate').innerHTML = '<option value="">Choose a candidate</option>' + applications.filter(item => !['hired', 'rejected'].includes(item.status)).map(item => `<option value="${item.id}">${recruitmentEscape(optionText(item))}</option>`).join('');
  document.getElementById('interview-interviewer').innerHTML = '<option value="">Use my account</option>' + (employees || []).map(item => `<option value="${item.id}">${recruitmentEscape(`${item.first_name} ${item.last_name}`)}</option>`).join('');
  if (interviewCandidateId) document.getElementById('interview-candidate').value = interviewCandidateId;
}
initialiseInterviewForm().catch(error => recruitmentNotice(error.message || 'Could not load interview details.', 'error'));
