const recruitmentCandidatesUser = requireAuth();
if (!recruitmentCandidatesUser) throw new Error('redirect');
buildSidebar('recruitment');
const recruitmentCandidatesId = new URLSearchParams(location.search).get('id');
const escapeCandidates = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
function returnToRecruitment() { if (window.self !== window.top) window.parent.postMessage({ type: 'hrconnect:navigate', route: 'recruitment' }, window.location.origin); else window.location.href = adminWorkspaceUrl('recruitment'); }
async function loadRecruitmentCandidates() {
  if (!recruitmentCandidatesId) return returnToRecruitment();
  const [data, stages] = await Promise.all([api.get(`/recruitment/jobs/${recruitmentCandidatesId}/candidates`), api.get('/recruitment/stages')]);
  const stageNames = Object.fromEntries(stages.map(stage => [stage.stage_key, stage.name])); const candidates = data.candidates;
  document.getElementById('page-title').textContent = data.recruitment.title; document.getElementById('page-copy').textContent = 'Candidates assigned to this recruitment.';
  document.getElementById('total-candidates').textContent = candidates.length; document.getElementById('in-progress-candidates').textContent = candidates.filter(candidate => !['hired','rejected'].includes(candidate.status)).length; document.getElementById('selected-candidates').textContent = candidates.filter(candidate => ['selection','offer','offer-acceptance','pre-employment','hired'].includes(candidate.status)).length;
  document.getElementById('candidate-rows').innerHTML = candidates.length ? candidates.map(candidate => `<tr><td><strong>${escapeCandidates(candidate.full_name)}</strong><br><small>${escapeCandidates(candidate.email)}</small></td><td>${escapeCandidates(stageNames[candidate.status] || candidate.status)}</td><td>${candidate.rating ? `${candidate.rating} / 5` : '—'}</td><td>${fmt.date(candidate.submitted_at)}</td><td><a class="btn btn-outline btn-sm" href="candidate.html?id=${candidate.id}">Open profile</a></td></tr>`).join('') : '<tr><td colspan="5">No candidates have applied to this recruitment yet.</td></tr>';
}
loadRecruitmentCandidates().catch(error => toast(error.message, 'error'));
