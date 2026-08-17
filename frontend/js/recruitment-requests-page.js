const recruitmentRequestsUser = initRecruitmentPlatform('requests');
if (!recruitmentRequestsUser) throw new Error('redirect');

const requestDate = value => value ? fmt.date(value) : '—';
function requestBadge(status) { return `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`; }

async function loadRequests() {
  const status = document.getElementById('request-filter').value;
  const requests = await api.get(`/recruitment/requests${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  document.getElementById('request-rows').innerHTML = requests.length ? requests.map(request => `<tr>
    <td><strong>${recruitmentEscape(request.title)}</strong><br><small>${recruitmentEscape(request.request_number || 'Being numbered')}</small></td>
    <td>${recruitmentEscape(request.department_name || 'Not assigned')}</td><td>${Number(request.headcount) || 1}</td>
    <td>${requestDate(request.target_start_date)}</td><td>${requestBadge(request.status)}</td>
    <td><a class="btn btn-outline btn-sm" href="recruitment-request-form.html?id=${request.id}">Open</a></td>
  </tr>`).join('') : '<tr><td colspan="6" class="recruitment-empty"><strong>No recruitment requests found.</strong>Create a request to start the vacancy lifecycle.</td></tr>';
}
document.getElementById('request-filter').addEventListener('change', () => loadRequests().catch(error => recruitmentNotice(error.message, 'error')));
loadRequests().catch(error => recruitmentNotice(error.message || 'Could not load recruitment requests.', 'error'));
