// @ts-check

(() => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="modal-overlay" id="memory-modal-overlay" onclick="MemoryTab.closeAddModal(event)">
      <section class="memory-modal" role="dialog" aria-modal="true" aria-labelledby="memory-modal-title">
        <div class="memory-modal-head">
          <h3 id="memory-modal-title">Add memory</h3>
          <button class="icon-btn" onclick="MemoryTab.closeAddModal()" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="memory-modal-body">
          <label class="modal-field">
            <span>Category</span>
            <select class="add-input" id="memory-modal-category">
              <option value="general">General</option>
              <option value="profile">Profile</option>
              <option value="career">Career</option>
              <option value="technical">Technical</option>
              <option value="workspace">Workspace</option>
              <option value="people">People</option>
              <option value="health">Health</option>
              <option value="finance">Finance</option>
              <option value="photography">Photo</option>
              <option value="travel">Travel</option>
              <option value="personal">Personal</option>
            </select>
          </label>
          <label class="modal-field">
            <span>Memory</span>
            <textarea class="rules-textarea" id="memory-modal-input" rows="7" placeholder="Write the memory agents should know."></textarea>
          </label>
        </div>
        <div class="memory-modal-actions">
          <button class="fb" onclick="MemoryTab.closeAddModal()">Cancel</button>
          <button class="save-btn" onclick="MemoryTab.createFromModal()">Save memory</button>
        </div>
      </section>
    </div>

    <div class="modal-overlay" id="mode-modal-overlay" onclick="ModesTab.closeCreateModal(event)">
      <section class="memory-modal mode-modal" role="dialog" aria-modal="true" aria-labelledby="mode-modal-title">
        <div class="memory-modal-head">
          <h3 id="mode-modal-title">New mode</h3>
          <button class="icon-btn" onclick="ModesTab.closeCreateModal()" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="memory-modal-body">
          <label class="modal-field">
            <span>Name</span>
            <input class="add-input" id="mode-modal-name" type="text" placeholder="Heavy Coding" />
          </label>
          <label class="modal-field">
            <span>Description</span>
            <textarea class="rules-textarea" id="mode-modal-desc" rows="3" placeholder="What this preset is for."></textarea>
          </label>
          <div class="mode-modal-grid">
            <label class="modal-field">
              <span>Icon</span>
              <select class="add-input" id="mode-modal-icon">
                <option value="bolt">Bolt</option>
                <option value="target">Target</option>
                <option value="focus">Focus</option>
                <option value="palette">Palette</option>
                <option value="image">Image</option>
                <option value="unlock">Unlock</option>
              </select>
            </label>
            <label class="modal-field">
              <span>Initial skills</span>
              <select class="add-input" id="mode-modal-seed" onchange="ModesTab.renderCreateSkills(this.value)">
                <option value="active">Use currently active skills</option>
                <option value="empty">Start empty</option>
                <option value="all">All discovered skills</option>
              </select>
            </label>
          </div>
          <div class="modal-field">
            <span>Enable skills</span>
            <div class="mode-skill-picker-head">
              <small id="mode-modal-skill-count">0 selected</small>
              <button class="mem-btn" type="button" onclick="ModesTab.renderCreateSkills('all')">All</button>
              <button class="mem-btn" type="button" onclick="ModesTab.renderCreateSkills('empty')">None</button>
            </div>
            <input class="add-input mode-skill-search" id="mode-modal-skill-search" type="search" placeholder="Search skills..." oninput="ModesTab.filterCreateSkills(this.value)" />
            <div class="mode-skill-picker" id="mode-modal-skills"></div>
          </div>
        </div>
        <div class="memory-modal-actions">
          <button class="fb" onclick="ModesTab.closeCreateModal()">Cancel</button>
          <button class="save-btn" onclick="ModesTab.createFromModal()">Create mode</button>
        </div>
      </section>
    </div>

    <div class="modal-overlay" id="skills-maintenance-overlay" onclick="SkillsMaintenance.close(event)">
      <section class="memory-modal skills-maintenance-modal" role="dialog" aria-modal="true" aria-labelledby="skills-maintenance-title">
        <div class="memory-modal-head">
          <h3 id="skills-maintenance-title">Clean Up Skills</h3>
          <button class="icon-btn" onclick="SkillsMaintenance.close()" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="memory-modal-body">
          <label class="maintenance-option">
            <input type="checkbox" class="styled-check" id="maintain-tidy" checked />
            <span><strong>Tidy library</strong><small>Move loose skills, remove duplicate imports, and clear empty folders.</small></span>
          </label>
          <label class="maintenance-option">
            <input type="checkbox" class="styled-check" id="maintain-metadata" checked />
            <span><strong>Parse missing metadata</strong><small>Use the configured LLM to infer descriptions and triggers for skills without metadata.</small></span>
          </label>
          <label class="maintenance-option">
            <input type="checkbox" class="styled-check" id="maintain-review" checked />
            <span><strong>Review overlapping skills</strong><small>Use the configured LLM to flag skills that appear to do the same job. No skill files are edited.</small></span>
          </label>
          <label class="maintenance-option">
            <input type="checkbox" class="styled-check" id="maintain-dedup" checked />
            <span><strong>Quality audit</strong><small>Use the vector index to flag duplicate clusters and low-specificity filler. Review markers are reversible.</small></span>
          </label>
          <div class="maintenance-llm">
            <select class="add-input" id="maintain-provider" onchange="SkillsMaintenance.updateProvider()">
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Local Ollama</option>
            </select>
            <input class="add-input" id="maintain-api-key" type="password" placeholder="Anthropic key for this run, or use stored key" />
            <input class="add-input" id="maintain-local-model" type="text" value="llama3.1:8b" list="maintain-local-models" hidden />
            <datalist id="maintain-local-models"></datalist>
          </div>
          <div class="skills-maintenance-results" id="skills-maintenance-results"></div>
        </div>
        <div class="memory-modal-actions">
          <button class="fb" onclick="SkillsMaintenance.close()">Cancel</button>
          <button class="save-btn" id="skills-maintenance-run" onclick="SkillsMaintenance.run()">Run Cleanup</button>
        </div>
      </section>
    </div>

    <div class="modal-overlay" id="skills-connect-overlay" onclick="SkillsTab.closeConnectModal(event)">
      <section class="memory-modal skills-connect-modal" role="dialog" aria-modal="true" aria-labelledby="skills-connect-title">
        <div class="memory-modal-head">
          <h3 id="skills-connect-title">Install Skills</h3>
          <button class="icon-btn" onclick="SkillsTab.closeConnectModal()" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div class="memory-modal-body">
          <label class="modal-field">
            <span>Repository URL</span>
            <input class="add-input" id="ingest-url" type="url" placeholder="https://github.com/owner/repo" />
          </label>
          <div class="repo-preset-grid">
            <button onclick="SkillsTab.quickAdd('anthropics/skills')"><strong>Anthropic</strong><span>Official skill examples</span></button>
            <button onclick="SkillsTab.quickAdd('openai/skills')"><strong>OpenAI</strong><span>Agent and coding skills</span></button>
            <button onclick="SkillsTab.quickAdd('meta-llama/llama-cookbook')"><strong>Meta</strong><span>Llama workflow examples</span></button>
          </div>
          <div id="ingest-progress" class="ingest-progress"></div>
          <div class="modal-divider"></div>
          <label class="modal-field">
            <span>Local folder</span>
            <div class="local-folder-row">
              <input class="add-input" id="link-local-path" type="text" placeholder="C:\\path\\to\\skills" oninput="SkillsTab._setLocalPath(this.value)" />
              <button class="fb local-browse-btn" type="button" onclick="SkillsTab.browseLocalFolder()">Browse\u2026</button>
            </div>
          </label>
          <div id="link-local-message" class="onboarding-source-message"></div>
        </div>
        <div class="memory-modal-actions">
          <button class="fb" onclick="SkillsTab.closeConnectModal()">Cancel</button>
          <button class="fb" onclick="SkillsTab.linkLocalFolder()">Link folder</button>
          <button class="save-btn" id="btn-ingest" onclick="SkillsTab.ingest()">Import skills</button>
        </div>
      </section>
    </div>
    `,
  );
})();
