const recruitmentOfferFormUser = initRecruitmentPlatform('offers');
if (!recruitmentOfferFormUser) throw new Error('redirect');

const offerApplicationId = new URLSearchParams(location.search).get('application_id');
function offerCandidateLabel(candidate) { return `${candidate.full_name} · ${candidate.requisition_title || candidate.role_applied || 'General application'}`; }

function fillOffer(candidate) {
  if (!candidate?.offer) return;
  document.getElementById('offer-salary').value = candidate.offer.salary ?? '';
  document.getElementById('offer-start-date').value = candidate.offer.start_date?.slice(0, 10) || '';
  document.getElementById('offer-status').value = candidate.offer.status || 'draft';
  document.getElementById('offer-message').value = candidate.offer.message || '';
}

document.getElementById('offer-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('offer-save');
  button.disabled = true;
  try {
    const candidateId = document.getElementById('offer-candidate').value;
    await api.put(`/recruitment/applications/${candidateId}/offer`, {
      salary: document.getElementById('offer-salary').value || null,
      start_date: document.getElementById('offer-start-date').value || null,
      status: document.getElementById('offer-status').value,
      message: document.getElementById('offer-message').value
    });
    window.location.assign('recruitment-offers.html?saved=1');
  } catch (error) { recruitmentNotice(error.message || 'Could not save this job offer.', 'error'); }
  finally { button.disabled = false; }
});

async function initialiseOfferForm() {
  const [applications, currentCandidate] = await Promise.all([
    api.get('/recruitment/applications'), offerApplicationId ? api.get(`/recruitment/applications/${offerApplicationId}`) : Promise.resolve(null)
  ]);
  document.getElementById('offer-candidate').innerHTML = '<option value="">Choose a candidate</option>' + applications.filter(item => !['hired', 'rejected'].includes(item.status)).map(item => `<option value="${item.id}">${recruitmentEscape(offerCandidateLabel(item))}</option>`).join('');
  if (currentCandidate) {
    document.getElementById('offer-candidate').value = offerApplicationId;
    fillOffer(currentCandidate);
  }
}
initialiseOfferForm().catch(error => recruitmentNotice(error.message || 'Could not load offer details.', 'error'));
