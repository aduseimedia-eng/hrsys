const recruitmentInterviewsUser = initRecruitmentPlatform('interviews');
if (!recruitmentInterviewsUser) throw new Error('redirect');

const interviewBadge = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;
async function loadInterviews() {
  const interviews = await api.get('/recruitment/interviews');
  document.getElementById('interview-rows').innerHTML = interviews.length ? interviews.map(item => `<tr>
    <td><strong>${new Date(item.scheduled_at).toLocaleString()}</strong><br><small>${item.duration_minutes || 45} minutes</small></td>
    <td>${recruitmentEscape(item.candidate_name)}</td><td>${recruitmentEscape(item.requisition_title || 'General application')}</td>
    <td>${recruitmentEscape(item.interviewer_name || 'Not assigned')}</td><td>${recruitmentEscape(item.meeting_location || 'Not set')}</td><td>${interviewBadge(item.status)}</td>
    <td><a class="btn btn-outline btn-sm" href="candidate.html?id=${item.application_id}">Candidate</a></td>
  </tr>`).join('') : '<tr><td colspan="7" class="recruitment-empty"><strong>No interviews scheduled.</strong>Schedule an interview when a candidate is ready for the conversation stage.</td></tr>';
  if (new URLSearchParams(location.search).get('saved') === '1') recruitmentNotice('Interview scheduled.', 'success');
}
loadInterviews().catch(error => recruitmentNotice(error.message || 'Could not load interviews.', 'error'));
