const recruitmentCandidateUser = initRecruitmentPlatform('applications');
if (!recruitmentCandidateUser) throw new Error('redirect');

const candidateId = new URLSearchParams(location.search).get('id');
let recruitmentCandidate = null;
let candidateStages = [];
const candidateDateTime = value => value ? new Date(value).toLocaleString() : '—';
const candidatePill = status => `<span class="recruitment-status recruitment-status--${recruitmentEscape(status)}">${recruitmentStatusLabel(status)}</span>`;

function candidateDocuments() {
  const documents = recruitmentCandidate.documents || [];
  return documents.length ? `<div class="recruitment-documents">${documents.map(document => `<button class="btn btn-outline btn-sm" type="button" data-document-id="${document.id}">${recruitmentEscape(document.name)}</button>`).join('')}</div>` : '<p>No documents uploaded.</p>';
}

function candidateHistory() {
  const history = recruitmentCandidate.stage_history || [];
  return history.length ? `<ul class="recruitment-timeline">${history.map(item => `<li><strong>${recruitmentEscape(item.from_stage_name || recruitmentStageLabel(item.from_stage_key || 'Application'))} → ${recruitmentEscape(item.to_stage_name || recruitmentStageLabel(item.to_stage_key))}</strong><small>${recruitmentEscape(item.changed_by_name || 'System')} · ${candidateDateTime(item.created_at)}${item.note ? ` · ${recruitmentEscape(item.note)}` : ''}</small></li>`).join('')}</ul>` : '<div class="recruitment-empty">No pipeline history is available yet.</div>';
}

function candidateInterviews() {
  const interviews = recruitmentCandidate.interviews || [];
  if (!interviews.length) return '<div class="recruitment-empty"><strong>No interviews scheduled.</strong>Use the schedule action when the candidate is ready.</div>';
  return interviews.map(interview => `<div class="recruitment-interview-summary"><div><strong>${candidateDateTime(interview.scheduled_at)}</strong><small>${recruitmentEscape(interview.interviewer_name || 'Interviewer not assigned')} · ${recruitmentEscape(interview.meeting_location || 'Location not set')}${interview.score ? ` · ${interview.score}/5` : ''}</small>${interview.feedback ? `<small>${recruitmentEscape(interview.feedback)}</small>` : ''}</div>${candidatePill(interview.status)}</div>`).join('');
}

function renderCandidate() {
  const candidate = recruitmentCandidate;
  document.getElementById('candidate-name').textContent = candidate.full_name;
  document.getElementById('candidate-contact').textContent = `${candidate.email}${candidate.phone ? ` · ${candidate.phone}` : ''}`;
  const offerAccepted = candidate.offer?.status === 'accepted';
  const handoffDisabled = candidate.hired_employee_id || !offerAccepted;
  document.getElementById('candidate-content').innerHTML = `<div class="recruitment-candidate-layout"><div class="recruitment-candidate-stack">
    <section class="recruitment-panel"><div class="recruitment-panel__header"><div><h2>${recruitmentEscape(candidate.requisition_title || candidate.role_applied || 'General application')}</h2><p>Applied ${fmt.date(candidate.submitted_at)} · ${recruitmentEscape(candidate.source || 'Source not recorded')}</p></div>${candidatePill(candidate.status)}</div><div style="padding:17px"><div class="recruitment-detail-copy">${recruitmentEscape(candidate.cover_note || 'No cover note provided.')}</div><h3 style="margin:18px 0 0;font-size:.9rem">Documents</h3>${candidateDocuments()}</div></section>
    <section class="recruitment-panel"><div class="recruitment-panel__header"><div><h2>Pipeline activity</h2><p>Every stage transition is retained for this candidate.</p></div></div><div style="padding:17px">${candidateHistory()}</div></section>
    <section class="recruitment-panel"><div class="recruitment-panel__header"><div><h2>Private notes</h2><p>Visible only to the recruitment team.</p></div></div><div style="padding:17px"><ul class="recruitment-timeline">${(candidate.notes || []).map(note => `<li><strong>${recruitmentEscape(note.body)}</strong><small>${recruitmentEscape(note.author_name || 'Recruitment team')} · ${candidateDateTime(note.created_at)}</small></li>`).join('') || '<li><strong>No notes yet.</strong></li>'}</ul><textarea id="candidate-note" class="form-control" rows="3" style="margin-top:16px" placeholder="Add a private recruitment note"></textarea><div class="recruitment-form-actions" style="margin-top:9px"><button class="btn btn-outline btn-sm" type="button" id="save-candidate-note">Save note</button></div></div></section>
  </div><aside class="recruitment-candidate-stack">
    <section class="recruitment-side-panel"><h2>Candidate controls</h2><label class="form-label" for="candidate-stage">Pipeline stage</label><select id="candidate-stage" class="form-control">${candidateStages.map(stage => `<option value="${recruitmentEscape(stage.stage_key)}" ${candidate.status === stage.stage_key ? 'selected' : ''}>${recruitmentEscape(stage.name)}</option>`).join('')}</select><label class="form-label" for="candidate-rating">Rating</label><select id="candidate-rating" class="form-control"><option value="">Not rated</option>${[1,2,3,4,5].map(value => `<option value="${value}" ${Number(candidate.rating) === value ? 'selected' : ''}>${value} / 5</option>`).join('')}</select><label class="form-label" for="candidate-stage-note">Stage-change note</label><textarea id="candidate-stage-note" class="form-control" rows="3" placeholder="Why is the candidate moving?"></textarea><div id="rejection-reason-group" class="form-group" style="margin-top:12px;display:${candidate.status === 'rejected' ? '' : 'none'}"><label class="form-label" for="candidate-rejection-reason">Rejection reason</label><textarea id="candidate-rejection-reason" class="form-control" rows="3" placeholder="Record a clear, job-related reason">${recruitmentEscape(candidate.rejected_reason || '')}</textarea></div><div class="recruitment-form-actions" style="margin-top:12px"><button id="save-candidate-stage" type="button" class="btn btn-primary btn-sm">Save candidate controls</button></div></section>
    <section class="recruitment-side-panel"><h2>Interviews</h2><p>Scheduling moves the candidate to the Interviews stage.</p><div class="recruitment-form-actions"><a class="btn btn-outline btn-sm" href="recruitment-interview-form.html?application_id=${candidate.id}">Schedule interview</a><a class="btn btn-outline btn-sm" href="recruitment-interviews.html">Interview list</a></div></section>
    <section class="recruitment-panel"><div class="recruitment-panel__header"><div><h2>Interview record</h2><p>Scheduled and completed conversations.</p></div></div>${candidateInterviews()}</section>
    <section class="recruitment-side-panel"><h2>Offer and onboarding</h2><p>${candidate.offer ? `Offer status: ${recruitmentStatusLabel(candidate.offer.status)}.` : 'No offer has been created.'}</p><div class="recruitment-form-actions"><a class="btn btn-outline btn-sm" href="recruitment-offer-form.html?application_id=${candidate.id}">${candidate.offer ? 'Open offer' : 'Create offer'}</a><button id="onboarding-handoff" class="btn btn-primary btn-sm" type="button" ${handoffDisabled ? 'disabled' : ''}>${candidate.hired_employee_id ? (candidate.applicant_employee_id ? 'Internal transfer complete' : 'Sent to onboarding') : 'Send to onboarding'}</button></div>${!candidate.hired_employee_id && !offerAccepted ? '<p style="margin-top:10px">An accepted offer is required before the onboarding handoff.</p>' : ''}</section>
  </aside></div>`;
  document.querySelectorAll('[data-document-id]').forEach(button => button.addEventListener('click', () => downloadCandidateDocument(button.dataset.documentId)));
  document.getElementById('candidate-stage').addEventListener('change', toggleRejectionReason);
  document.getElementById('save-candidate-stage').addEventListener('click', saveCandidateControls);
  document.getElementById('save-candidate-note').addEventListener('click', saveCandidateNote);
  document.getElementById('onboarding-handoff')?.addEventListener('click', handoffCandidate);
}

function toggleRejectionReason() {
  document.getElementById('rejection-reason-group').style.display = document.getElementById('candidate-stage').value === 'rejected' ? '' : 'none';
}

async function saveCandidateControls() {
  try {
    await api.patch(`/recruitment/applications/${candidateId}`, {
      status: document.getElementById('candidate-stage').value,
      rating: document.getElementById('candidate-rating').value || null,
      note: document.getElementById('candidate-stage-note').value,
      rejected_reason: document.getElementById('candidate-rejection-reason')?.value || null
    });
    recruitmentNotice('Candidate controls saved.', 'success');
    await loadCandidate();
  } catch (error) { recruitmentNotice(error.message || 'Could not update this candidate.', 'error'); }
}

async function saveCandidateNote() {
  const input = document.getElementById('candidate-note');
  if (!input.value.trim()) return recruitmentNotice('Enter a note before saving.', 'warning');
  try { await api.post(`/recruitment/applications/${candidateId}/notes`, { body: input.value }); recruitmentNotice('Private note saved.', 'success'); await loadCandidate(); }
  catch (error) { recruitmentNotice(error.message || 'Could not save this note.', 'error'); }
}

async function handoffCandidate() {
  try { await api.post(`/recruitment/applications/${candidateId}/hire`, {}); recruitmentNotice('Candidate handed to onboarding.', 'success'); await loadCandidate(); }
  catch (error) { recruitmentNotice(error.message || 'Could not hand off this candidate.', 'error'); }
}

async function downloadCandidateDocument(documentId) {
  const response = await fetch(`${API_BASE}/recruitment/applications/${candidateId}/documents/${documentId}`, { headers: { Authorization: `Bearer ${api.getToken()}` } });
  if (!response.ok) return recruitmentNotice('Could not download this document.', 'error');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = 'candidate-document'; link.click(); URL.revokeObjectURL(url);
}

async function loadCandidate() {
  [recruitmentCandidate, candidateStages] = await Promise.all([api.get(`/recruitment/applications/${candidateId}`), api.get('/recruitment/stages')]);
  renderCandidate();
}
if (!candidateId) window.location.replace('applications.html');
else loadCandidate().catch(error => recruitmentNotice(error.message || 'Could not load this candidate.', 'error'));
