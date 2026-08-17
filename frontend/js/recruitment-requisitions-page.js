const recruitmentRequisitionsUser = initRecruitmentPlatform('requisitions');
if (!recruitmentRequisitionsUser) throw new Error('redirect');

function requisitionBadge(status) { return `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`; }
async function loadRequisitions() {
  const approvalStatus = document.getElementById('requisition-filter').value;
  const requisitions = await api.get(`/recruitment/requisitions${approvalStatus ? `?approval_status=${encodeURIComponent(approvalStatus)}` : ''}`);
  document.getElementById('requisition-rows').innerHTML = requisitions.length ? requisitions.map(item => `<tr>
    <td><strong>${recruitmentEscape(item.title)}</strong><br><small>${recruitmentEscape(item.requisition_code || 'Being numbered')}${item.request_number ? ` · ${recruitmentEscape(item.request_number)}` : ''}</small></td>
    <td>${recruitmentEscape(item.manager_name || 'Not assigned')}</td><td>${Number(item.headcount) || 1}</td><td>${Number(item.applicant_count) || 0}</td>
    <td>${Number(item.published_posting_count) || 0}</td><td>${requisitionBadge(item.approval_status)}</td>
    <td><a class="btn btn-outline btn-sm" href="recruitment-form.html?id=${item.id}">Open</a></td>
  </tr>`).join('') : '<tr><td colspan="7" class="recruitment-empty"><strong>No requisitions found.</strong>Approved requests can be converted here, or create one directly.</td></tr>';
}
document.getElementById('requisition-filter').addEventListener('change', () => loadRequisitions().catch(error => recruitmentNotice(error.message, 'error')));
loadRequisitions().catch(error => recruitmentNotice(error.message || 'Could not load job requisitions.', 'error'));
