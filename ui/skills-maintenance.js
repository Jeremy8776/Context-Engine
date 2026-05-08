const SkillsMaintenance = (() => {
  const ids = {
    overlay: 'skills-maintenance-overlay',
    tidy: 'maintain-tidy',
    metadata: 'maintain-metadata',
    review: 'maintain-review',
    provider: 'maintain-provider',
    apiKey: 'maintain-api-key',
    localModel: 'maintain-local-model',
    localModels: 'maintain-local-models',
    results: 'skills-maintenance-results',
    run: 'skills-maintenance-run',
  };
  let localModelsLoaded = false;
  let reviewGroups = [];

  function el(id) {
    return document.getElementById(id);
  }

  function open() {
    const results = el(ids.results);
    if (results) results.innerHTML = '';
    updateProvider();
    el(ids.overlay)?.classList.add('open');
  }

  function close(event) {
    if (event && event.target.id !== ids.overlay) return;
    el(ids.overlay)?.classList.remove('open');
  }

  function setBusy(busy) {
    const btn = el(ids.run);
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? 'Running...' : 'Run Cleanup';
  }

  function addResult(title, body, tone = '') {
    const results = el(ids.results);
    if (!results) return;
    results.insertAdjacentHTML(
      'beforeend',
      `
      <div class="maintenance-result ${tone}">
        <strong>${esc(title)}</strong>
        <span>${esc(body)}</span>
      </div>`,
    );
  }

  async function loadOllamaModels() {
    if (localModelsLoaded) return;
    localModelsLoaded = true;
    const data = await DS.getOllamaModels();
    const models = data?.models || [];
    const list = el(ids.localModels);
    const modelInput = el(ids.localModel);
    if (list) {
      list.innerHTML = models.map((model) => `<option value="${esc(model)}"></option>`).join('');
    }
    if (models.length && modelInput && !models.includes(modelInput.value)) {
      modelInput.value = models.includes('llama3.1:8b') ? 'llama3.1:8b' : models[0];
    }
  }

  function updateProvider() {
    const local = el(ids.provider)?.value === 'ollama';
    const key = el(ids.apiKey);
    const model = el(ids.localModel);
    if (key) key.hidden = local;
    if (model) {
      model.hidden = !local;
      model.placeholder = 'Ollama model, e.g. llama3.1';
    }
    if (local) loadOllamaModels();
  }

  function llmOptions() {
    const provider = el(ids.provider)?.value || 'anthropic';
    return {
      provider,
      apiKey: provider === 'anthropic' ? (el(ids.apiKey)?.value || '').trim() : '',
      model: provider === 'ollama' ? (el(ids.localModel)?.value || '').trim() : '',
    };
  }

  function renderReview(groups) {
    const results = el(ids.results);
    if (!results || !groups?.length) return;
    reviewGroups = groups.map((group) => ({ ...group, skills: group.skills || [] }));
    const rows = reviewGroups
      .map((group, index) => {
        const activeSkill = group.skills.find((id) => SS.active(id)) || group.skills[0];
        const options = group.skills
          .map((id) => {
            const skill = SKILL_DATA.find((item) => item.id === id);
            const label = skill?.name || skill?.id || id;
            return `
          <label class="maintenance-review-choice">
            <input type="radio" name="review-keep-${index}" value="${esc(id)}" ${id === activeSkill ? 'checked' : ''}>
            <span>
              <strong>${esc(label)}</strong>
              <small>${esc(skill?.desc || id)}</small>
            </span>
          </label>`;
          })
          .join('');
        return `
      <div class="maintenance-review-group" data-review-index="${index}">
        <div class="maintenance-review-head">
          <strong>${esc(group.skills.join(' + '))}</strong>
          <span>${Math.round((group.confidence || 0) * 100)}%</span>
        </div>
        <span>${esc(group.reason || 'Similar purpose or trigger wording')}</span>
        <div class="maintenance-review-choices">${options}</div>
        <button class="fb maintenance-apply-btn" type="button" onclick="SkillsMaintenance.applyReview(${index})">Keep selected, disable others</button>
      </div>`;
      })
      .join('');
    results.insertAdjacentHTML(
      'beforeend',
      `
      <div class="maintenance-review">
        <div class="maintenance-result warn">
          <strong>Review before applying</strong>
          <span>Choose one keeper in each group, then apply the reviewed choices. This only changes active states.</span>
          <button class="fb maintenance-apply-btn" type="button" onclick="SkillsMaintenance.applyAllReviews()">Apply reviewed choices</button>
        </div>
        ${rows}
      </div>`,
    );
  }

  function selectedReviewChoices() {
    return reviewGroups
      .map((group, index) => {
        const container = document.querySelector(`[data-review-index="${index}"]`);
        return {
          index,
          ids: group.skills,
          keepId: container?.querySelector('input[type="radio"]:checked')?.value,
        };
      })
      .filter((choice) => choice.ids?.length && choice.keepId);
  }

  function markApplied(index) {
    const container = document.querySelector(`[data-review-index="${index}"]`);
    if (!container) return;
    container.classList.add('applied');
    container.querySelectorAll('input, button').forEach((input) => {
      input.disabled = true;
    });
    const btn = container.querySelector('.maintenance-apply-btn');
    if (btn) btn.textContent = 'Applied';
  }

  async function applyReview(index) {
    const group = reviewGroups[index];
    if (!group?.skills?.length) return;
    const container = document.querySelector(`[data-review-index="${index}"]`);
    const keepId = container?.querySelector('input[type="radio"]:checked')?.value;
    if (!keepId) {
      Toast.warn('Choose which skill to keep');
      return;
    }
    const result = await SS.applyReview(group.skills, keepId);
    if (!result?.ok) {
      Toast.error(result?.error || 'Review apply failed');
      return;
    }
    markApplied(index);
    await refreshSkills();
    Toast.success(`Kept ${keepId}; disabled ${group.skills.length - 1} overlap(s)`);
  }

  async function applyAllReviews() {
    const choices = selectedReviewChoices();
    if (!choices.length) {
      Toast.warn('No reviewed choices to apply');
      return;
    }
    const result = await SS.applyReviewChoices(choices);
    if (!result?.ok) {
      Toast.error(result?.error || 'Review apply failed');
      return;
    }
    choices.forEach((choice) => markApplied(choice.index));
    await refreshSkills();
    Toast.success(`Applied ${choices.length} reviewed overlap group(s)`);
  }

  async function runTidy() {
    const preview = await DS.organiseSkills(false);
    if (!preview?.ok) throw new Error(preview?.error || 'Skill tidy preview failed');
    const summary = preview.summary || {};
    const actionable =
      (summary.moved || 0) + (summary.duplicatesRemoved || 0) + (summary.emptyDirsRemoved || 0);
    if (!actionable) {
      addResult(
        'Library tidy',
        summary.reviewNeeded
          ? `${summary.reviewNeeded} item(s) need manual review`
          : 'Nothing to move or remove',
      );
      return;
    }
    const ok = await AppDialog.confirm({
      title: 'Tidy skill library',
      message: `Move ${summary.moved || 0} loose skill(s), remove ${summary.duplicatesRemoved || 0} duplicate import(s), and clear ${summary.emptyDirsRemoved || 0} empty folder(s)?`,
      confirmText: 'Tidy library',
    });
    if (!ok) {
      addResult('Library tidy', 'Skipped by user');
      return;
    }
    const result = await DS.organiseSkills(true);
    if (!result?.ok) throw new Error(result?.error || 'Skill tidy failed');
    const done = result.summary || {};
    addResult(
      'Library tidy',
      `${done.moved || 0} moved, ${done.duplicatesRemoved || 0} duplicates removed, ${done.emptyDirsRemoved || 0} empty folders removed`,
      'ok',
    );
  }

  async function runMetadata() {
    const unparsed = SKILL_DATA.filter((s) => s.needsParse).length;
    if (!unparsed) {
      addResult('Metadata parse', 'All skills already have metadata');
      return;
    }
    const res = await DS.parseSkills(llmOptions());
    if (!res?.ok) throw new Error(res?.error || 'Metadata parse failed');
    addResult('Metadata parse', `${res.parsed || 0}/${res.total || unparsed} skills enriched`, 'ok');
  }

  async function runReview() {
    const res = await DS.reviewSimilarSkills(llmOptions());
    if (!res?.ok) throw new Error(res?.error || 'Similarity review failed');
    const groups = res.groups || [];
    addResult(
      'Similarity review',
      groups.length ? `${groups.length} possible overlap group(s) flagged` : 'No likely overlaps found',
      groups.length ? 'warn' : 'ok',
    );
    renderReview(groups);
  }

  async function refreshSkills() {
    await loadSkillData();
    if (typeof SkillsTab !== 'undefined') SkillsTab.init();
    if (typeof DashboardTab !== 'undefined') DashboardTab.init();
  }

  async function run() {
    const useTidy = el(ids.tidy)?.checked;
    const useMetadata = el(ids.metadata)?.checked;
    const useReview = el(ids.review)?.checked;
    if (!useTidy && !useMetadata && !useReview) {
      Toast.warn('Choose at least one cleanup action');
      return;
    }
    el(ids.results).innerHTML = '';
    setBusy(true);
    try {
      if (useTidy) await runTidy();
      if (useMetadata) await runMetadata();
      if (useReview) await runReview();
      await refreshSkills();
      Toast.success('Skill cleanup complete');
    } catch (error) {
      addResult('Cleanup stopped', error.message || 'Unknown error', 'err');
      Toast.error(error.message || 'Skill cleanup failed');
    } finally {
      setBusy(false);
    }
  }

  return { open, close, run, updateProvider, applyReview, applyAllReviews };
})();
