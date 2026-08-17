const recruitmentPostingsUser = initRecruitmentPlatform('postings');
if (!recruitmentPostingsUser) throw new Error('redirect');

const postingChannelLabel = channel => ({ internal: 'Internal staff', 'company-site': 'Careers site', external: 'External channel' }[channel] || recruitmentStatusLabel(channel));
const postingBadge = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;
async function loadPostings() {
  const postings = await api.get('/recruitment/postings');
  document.getElementById('posting-rows').innerHTML = postings.length ? postings.map(item => `<tr>
    <td><strong>${recruitmentEscape(item.title)}</strong><br><small>${item.published_at ? `Published ${fmt.date(item.published_at)}` : 'Not published'}</small></td>
    <td>${recruitmentEscape(item.requisition_code || '—')}<br><small>${recruitmentEscape(item.requisition_title)}</small></td>
    <td>${postingChannelLabel(item.channel)}</td><td>${item.closes_at ? fmt.date(item.closes_at) : 'No close date'}</td>
    <td>${postingBadge(item.status)}</td><td>${Number(item.applicant_count) || 0}</td>
    <td><a class="btn btn-outline btn-sm" href="recruitment-posting-form.html?id=${item.id}">Open</a></td>
  </tr>`).join('') : '<tr><td colspan="7" class="recruitment-empty"><strong>No job postings yet.</strong>Approve a requisition, then choose the channels on which it should be visible.</td></tr>';
  if (new URLSearchParams(location.search).get('saved') === '1') recruitmentNotice('Job posting saved.', 'success');
}
loadPostings().catch(error => recruitmentNotice(error.message || 'Could not load job postings.', 'error'));
