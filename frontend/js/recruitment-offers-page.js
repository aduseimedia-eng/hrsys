const recruitmentOffersUser = initRecruitmentPlatform('offers');
if (!recruitmentOffersUser) throw new Error('redirect');

const offerBadge = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;
async function loadOffers() {
  const offers = await api.get('/recruitment/offers');
  document.getElementById('offer-rows').innerHTML = offers.length ? offers.map(item => `<tr>
    <td><strong>${recruitmentEscape(item.candidate_name)}</strong><br><small>${recruitmentEscape(item.email)}</small></td>
    <td>${recruitmentEscape(item.requisition_title || 'General application')}</td><td>${item.start_date ? fmt.date(item.start_date) : 'Not set'}</td>
    <td>${item.salary ? fmt.currency(item.salary) : 'Not set'}</td><td>${offerBadge(item.status)}</td><td>${fmt.date(item.updated_at)}</td>
    <td><a class="btn btn-outline btn-sm" href="recruitment-offer-form.html?application_id=${item.application_id}">Open</a></td>
  </tr>`).join('') : '<tr><td colspan="7" class="recruitment-empty"><strong>No job offers yet.</strong>Create an offer once a candidate has been selected.</td></tr>';
  if (new URLSearchParams(location.search).get('saved') === '1') recruitmentNotice('Job offer saved.', 'success');
}
loadOffers().catch(error => recruitmentNotice(error.message || 'Could not load job offers.', 'error'));
