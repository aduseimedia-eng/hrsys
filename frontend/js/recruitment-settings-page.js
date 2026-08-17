const recruitmentSettingsUser = initRecruitmentPlatform('settings');
if (!recruitmentSettingsUser) throw new Error('redirect');

let recruitmentConfiguredStages = [];
let pendingStageRemoval = null;
function openStageModal() { document.getElementById('stage-name').value = ''; document.getElementById('stage-modal').style.display = 'flex'; document.getElementById('stage-name').focus(); }
function closeStageModal() { document.getElementById('stage-modal').style.display = 'none'; }

function renderStages() {
  document.getElementById('stage-rows').innerHTML = recruitmentConfiguredStages.map(stage => `<tr><td><strong>${recruitmentEscape(stage.name)}</strong><br><small>${recruitmentEscape(stage.stage_key)}</small></td><td>${stage.sort_order}</td><td>${stage.is_system ? 'Default workflow stage' : 'Custom stage'}</td><td>${stage.is_system ? 'Protected' : `<button class="btn btn-outline btn-sm" type="button" data-remove-stage="${stage.id}">Remove</button>`}</td></tr>`).join('');
  document.querySelectorAll('[data-remove-stage]').forEach(button => button.addEventListener('click', () => requestStageRemoval(button.dataset.removeStage)));
}

function requestStageRemoval(stageId) {
  pendingStageRemoval = stageId;
  const stage = recruitmentConfiguredStages.find(item => String(item.id) === String(stageId));
  const notice = document.getElementById('stage-remove-notice');
  notice.hidden = false;
  notice.innerHTML = `Remove <strong>${recruitmentEscape(stage?.name || 'this stage')}</strong>? It can only be removed when no candidate is using it. <span class="recruitment-form-actions" style="display:inline-flex;margin-left:8px"><button class="btn btn-danger btn-sm" type="button" id="confirm-stage-remove">Remove stage</button><button class="btn btn-outline btn-sm" type="button" id="cancel-stage-remove">Keep stage</button></span>`;
  document.getElementById('confirm-stage-remove').addEventListener('click', removeStage);
  document.getElementById('cancel-stage-remove').addEventListener('click', () => { notice.hidden = true; pendingStageRemoval = null; });
}

async function removeStage() {
  try {
    await api.delete(`/recruitment/stages/${pendingStageRemoval}`);
    document.getElementById('stage-remove-notice').hidden = true;
    pendingStageRemoval = null;
    recruitmentNotice('Custom stage removed.', 'success');
    await loadStages();
  } catch (error) { recruitmentNotice(error.message || 'Could not remove this stage.', 'error'); }
}

async function loadStages() {
  recruitmentConfiguredStages = await api.get('/recruitment/stages');
  renderStages();
}

document.getElementById('add-stage').addEventListener('click', openStageModal);
document.getElementById('close-stage-modal').addEventListener('click', closeStageModal);
document.getElementById('cancel-stage-modal').addEventListener('click', closeStageModal);
document.getElementById('save-stage').addEventListener('click', async () => {
  const button = document.getElementById('save-stage');
  button.disabled = true;
  try {
    await api.post('/recruitment/stages', { name: document.getElementById('stage-name').value });
    closeStageModal();
    recruitmentNotice('Candidate stage added.', 'success');
    await loadStages();
  } catch (error) { recruitmentNotice(error.message || 'Could not add this stage.', 'error'); }
  finally { button.disabled = false; }
});
loadStages().catch(error => recruitmentNotice(error.message || 'Could not load recruitment settings.', 'error'));
