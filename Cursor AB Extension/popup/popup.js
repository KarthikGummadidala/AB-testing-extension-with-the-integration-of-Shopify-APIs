(function () {
  const AB_EVENTS_KEY = 'ab_events';
  const connectionSection = document.getElementById('connectionSection');
  const connectionStatus = document.getElementById('connectionStatus');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const openSettings = document.getElementById('openSettings');
  const experimentsSection = document.getElementById('experimentsSection');
  const experimentList = document.getElementById('experimentList');
  const newExperimentBtn = document.getElementById('newExperiment');
  const visuallySection = document.getElementById('visuallySection');
  const visuallyStatus = document.getElementById('visuallyStatus');
  const visuallyInfo = document.getElementById('visuallyInfo');
  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const resultsTableWrap = document.getElementById('resultsTableWrap');
  const diagnosticsWrap = document.getElementById('diagnosticsWrap');
  const runDiagnosticsBtn = document.getElementById('runDiagnostics');
  const refreshResultsBtn = document.getElementById('refreshResults');
  const clearResultsBtn = document.getElementById('clearResults');

  async function loadStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        ['shopDomain', 'storefrontToken', 'adminToken', 'experiments'],
        (data) => resolve(data)
      );
    });
  }

  async function loadEvents() {
    return new Promise((resolve) => {
      chrome.storage.local.get([AB_EVENTS_KEY], (data) => resolve(data[AB_EVENTS_KEY] || []));
    });
  }

  function setConnectionStatus(connected, message) {
    statusDot.className = 'status-dot' + (connected ? ' connected' : connected === false ? ' error' : '');
    statusText.textContent = message;
  }

  async function checkConnection() {
    const { shopDomain, storefrontToken } = await loadStorage();
    if (!shopDomain || !storefrontToken) {
      setConnectionStatus(false, 'Not connected');
      return false;
    }
    setConnectionStatus(null, 'Checking…');
    try {
      const res = await fetch(`https://${shopDomain}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefrontToken,
        },
        body: JSON.stringify({ query: 'query { shop { name } }' }),
      });
      const data = await res.json();
      if (data?.data?.shop) {
        setConnectionStatus(true, data.data.shop.name || shopDomain);
        return true;
      }
      setConnectionStatus(false, data?.errors?.[0]?.message || 'Connection failed');
    } catch (e) {
      setConnectionStatus(false, 'Connection failed');
    }
    return false;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderExperiments(experiments) {
    if (!experiments || experiments.length === 0) {
      experimentList.innerHTML = '<li class="empty-state">No experiments yet. Create one to get started.</li>';
      return;
    }
    experimentList.innerHTML = experiments
      .map(
        (exp) => {
          const hasEngine = !!(exp.selector && exp.variantContent);
          const meta = [
            exp.variants?.length || 0,
            'variants',
            exp.goal || 'Conversion',
            hasEngine ? '· Live' : '',
          ].filter(Boolean).join(' ');
          return `
        <li data-id="${exp.id}">
          <div>
            <div class="experiment-name">${escapeHtml(exp.name)}</div>
            <div class="experiment-meta">${meta}</div>
          </div>
          <div class="experiment-actions">
            <button type="button" data-action="edit" data-id="${exp.id}">Edit</button>
            <button type="button" data-action="delete" data-id="${exp.id}">Delete</button>
          </div>
        </li>
      `;
        }
      )
      .join('');

    experimentList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => deleteExperiment(btn.dataset.id));
    });
    experimentList.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openEditExperiment(btn.dataset.id));
    });
  }

  function aggregateResults(events, experiments) {
    const existingIds = new Set((experiments || []).map((e) => e.id));
    const byExp = {};
    (events || []).forEach((ev) => {
      const k = ev.experimentId != null ? ev.experimentId : (ev.experienceKey != null ? ev.experienceKey : null);
      const v = ev.variant != null ? ev.variant : (ev.variantKey != null ? ev.variantKey : 'unknown');
      if (k == null) return;
      if (existingIds.size && !existingIds.has(k)) return; // hide deleted experiments
      if (!byExp[k]) byExp[k] = {};
      if (!byExp[k][v]) byExp[k][v] = { impressions: 0, conversions: 0, experienceName: ev.experienceName || k, variantName: ev.variantName || v };
      if (ev.type === 'impression') byExp[k][v].impressions++;
      if (ev.type === 'conversion') byExp[k][v].conversions++;
    });
    return byExp;
  }

  function renderResults(events, experiments) {
    const byExp = aggregateResults(events, experiments);
    const expIds = Object.keys(byExp);
    if (expIds.length === 0) {
      resultsPlaceholder.classList.remove('hidden');
      resultsTableWrap.classList.add('hidden');
      return;
    }
    resultsPlaceholder.classList.add('hidden');
    resultsTableWrap.classList.remove('hidden');
    const rows = [];
    expIds.forEach((expId) => {
      const exp = (experiments || []).find((e) => e.id === expId);
      const name = exp ? exp.name : (byExp[expId] && Object.values(byExp[expId])[0] && Object.values(byExp[expId])[0].experienceName) ? Object.values(byExp[expId])[0].experienceName : expId;
      const variants = byExp[expId];
      Object.keys(variants).forEach((variant) => {
        const d = variants[variant];
        const rate = d.impressions ? ((d.conversions / d.impressions) * 100).toFixed(1) : '—';
        const displayVariant = d.variantName != null ? d.variantName : variant;
        rows.push(`<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(displayVariant)}</td><td>${d.impressions}</td><td>${d.conversions}</td><td class="conv-rate">${rate}%</td></tr>`);
      });
    });
    resultsTableWrap.innerHTML = `
      <table>
        <thead><tr><th>Experiment</th><th>Variant</th><th>Impressions</th><th>Conversions</th><th>Rate</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  async function refreshResults() {
    const [events, { experiments = [] }] = await Promise.all([loadEvents(), loadStorage()]);
    renderResults(events, experiments);
  }

  async function clearResults() {
    if (!confirm('Permanently delete all experiment data? This cannot be undone.')) return;
    await new Promise((resolve) => chrome.storage.local.remove([AB_EVENTS_KEY], resolve));
    await refreshResults();
    diagnosticsWrap.classList.add('hidden');
  }

  async function runDiagnostics() {
    diagnosticsWrap.classList.remove('hidden');
    diagnosticsWrap.innerHTML = 'Running diagnostics…';
    const [events, { experiments = [] }] = await Promise.all([loadEvents(), loadStorage()]);
    const byExp = aggregateResults(events, experiments);
    const expIds = Object.keys(byExp);

    const resultsRows = [];
    expIds.forEach((expId) => {
      const exp = experiments.find((e) => e.id === expId);
      const name = exp ? exp.name : expId;
      const variants = byExp[expId];
      Object.keys(variants).forEach((variant) => {
        const d = variants[variant];
        const rate = d.impressions ? ((d.conversions / d.impressions) * 100).toFixed(1) : '—';
        resultsRows.push(`<tr><td style="padding:4px; border-bottom:1px solid #2d3a4d;">${escapeHtml(name)}</td><td style="padding:4px; border-bottom:1px solid #2d3a4d;">${escapeHtml(variant)}</td><td style="padding:4px; border-bottom:1px solid #2d3a4d;">${d.impressions}</td><td style="padding:4px; border-bottom:1px solid #2d3a4d;">${d.conversions}</td><td style="padding:4px; border-bottom:1px solid #2d3a4d; color:#22c55e;">${rate}%</td></tr>`);
      });
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        buildDiagnosticsOutput(null, resultsRows, experiments);
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: 'AB_DIAGNOSTICS' }).then(
        (d) => {
          buildDiagnosticsOutput(d, resultsRows, experiments);
        },
        () => {
          buildDiagnosticsOutput(null, resultsRows, experiments);
        }
      );
    });

    function buildDiagnosticsOutput(d, resultsRows, experiments) {
      const lines = [];
      if (resultsRows.length > 0) {
        lines.push('<div style="margin-bottom:12px;"><strong>Experiment results</strong></div>');
        lines.push('<table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;"><thead><tr><th style="text-align:left; padding:4px; border-bottom:1px solid #2d3a4d;">Experiment</th><th style="text-align:left; padding:4px; border-bottom:1px solid #2d3a4d;">Variant</th><th style="text-align:left; padding:4px; border-bottom:1px solid #2d3a4d;">Impressions</th><th style="text-align:left; padding:4px; border-bottom:1px solid #2d3a4d;">Conversions</th><th style="text-align:left; padding:4px; border-bottom:1px solid #2d3a4d;">Rate</th></tr></thead><tbody>' + resultsRows.join('') + '</tbody></table>');
      } else {
        lines.push('<div style="color:#8b9cb4; font-size:12px; margin-bottom:12px;">No experiment data yet. Visit a page that runs an experiment.</div>');
      }
      if (d) {
        lines.push('<hr style="border:0;border-top:1px solid #2d3a4d; margin:8px 0;"/>');
        lines.push(`<div><strong>URL:</strong> ${escapeHtml(d.url || '')}</div>`);
        lines.push(`<div><strong>Visitor:</strong> ${escapeHtml(d.visitorId || '')}</div>`);
        lines.push(`<div><strong>Experiments on this page:</strong> ${d.experimentsTotal} total, ${d.experimentsRunnable} runnable</div>`);

        // Show one block per saved experiment, always, enriched with diagnostics
        if (experiments && experiments.length) {
          lines.push('<hr style="border:0;border-top:1px solid #2d3a4d; margin:8px 0;"/>');
          experiments.forEach((exp) => {
            const diag = (d.runnableDetails || []).find((e) => e.id === exp.id) || {};
            const selectorMatched = diag.selectorMatched ? 'YES' : 'NO';
            const storedVariant = diag.storedVariant ?? '—';
            const computedVariant = diag.computedVariant ?? '—';
            lines.push(
              `<div style="margin-bottom:8px; font-size:12px; color:#e5e7eb;">
<div><strong>${escapeHtml(exp.name || exp.id)}</strong></div>
<div>selector: <code>${escapeHtml(exp.selector || '')}</code> · matched: <strong>${selectorMatched}</strong></div>
<div>stored variant: ${escapeHtml(storedVariant)} · computed variant: ${escapeHtml(computedVariant)}</div>
</div>`
            );
          });
        } else {
          lines.push('<div style="color:#8b9cb4; font-size:12px;">No experiments found on this page. Make sure your experiments are saved.</div>');
        }
      } else {
        // Fallback: we could not reach the content script, but we still have the
        // list of experiments from storage. Show a compact summary so the user
        // can at least see configured experiments.
        if (experiments && experiments.length) {
          lines.push('<hr style="border:0;border-top:1px solid #2d3a4d; margin:8px 0;"/>');
          lines.push('<div style="font-size:12px; color:#e5e7eb; margin-bottom:4px;">Experiments (no per-page diagnostics available):</div>');
          experiments.forEach((e) => {
            lines.push(
              `<div style="margin-bottom:4px; font-size:12px; color:#e5e7eb;">
${escapeHtml(e.name || e.id)} selector: <code>${escapeHtml(e.selector || '')}</code> · matched: <strong>?</strong> stored variant: — · computed variant: —
</div>`
            );
          });
        } else {
          lines.push('<hr style="border:0;border-top:1px solid #2d3a4d; margin:8px 0;"/>');
          lines.push('<div style="color:#8b9cb4; font-size:12px;">Open a Shopify storefront tab to see URL, visitor, and per-page experiment details.</div>');
        }
      }
      diagnosticsWrap.innerHTML = lines.join('');
    }
  }

  async function deleteExperiment(id) {
    const { experiments = [] } = await loadStorage();
    const next = experiments.filter((e) => e.id !== id);
    await new Promise((r) => chrome.storage.sync.set({ experiments: next }, r));
    renderExperiments(next);
    refreshResults();
  }

  async function openEditExperiment(id) {
    const { experiments = [] } = await loadStorage();
    const exp = experiments.find((e) => e.id === id);
    if (!exp) return;
    showEditExperimentModal(exp);
  }

  function showEditExperimentModal(exp) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-wide">
        <h3>Edit experiment</h3>
        <form id="editExperimentForm">
          <div class="form-group">
            <label for="editExpName">Experiment name</label>
            <input type="text" id="editExpName" placeholder="e.g. Homepage headline test" required />
          </div>
          <div class="form-group">
            <label for="editExpSelector">CSS selector for element to change</label>
            <input type="text" id="editExpSelector" placeholder="e.g. h1.title, .hero-headline, #main-heading" required />
          </div>
          <div class="form-group">
            <label for="editExpContentType">Content type</label>
            <select id="editExpContentType">
              <option value="text">Text only</option>
              <option value="html">HTML</option>
            </select>
          </div>
          <div class="form-group">
            <label for="editExpVariants">Variants (comma-separated)</label>
            <input type="text" id="editExpVariants" placeholder="Control, Variant B" required />
          </div>
          <div id="editVariantContentFields" class="variant-content-fields"></div>
          <div class="form-group">
            <label for="editExpAllocation">Variant allocation % (same order as variants)</label>
            <input type="text" id="editExpAllocation" placeholder="50, 50" />
          </div>
          <div class="form-group">
            <label for="editExpGoalType">Goal type</label>
            <select id="editExpGoalType">
              <option value="">None</option>
              <option value="selector_click">Click on element (CSS selector)</option>
              <option value="url_contains">URL contains (e.g. /thank_you)</option>
            </select>
          </div>
          <div class="form-group" id="editGoalValueGroup">
            <label for="editExpGoalValue">Goal value</label>
            <input type="text" id="editExpGoalValue" placeholder="e.g. button.add-to-cart or /thank_you" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="editModalCancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#editExpName').value = exp.name || '';
    overlay.querySelector('#editExpSelector').value = exp.selector || '';
    overlay.querySelector('#editExpContentType').value = exp.contentType || 'text';
    overlay.querySelector('#editExpVariants').value = (exp.variants || []).join(', ');
    overlay.querySelector('#editExpAllocation').value = (exp.allocation || [50, 50]).join(', ');
    overlay.querySelector('#editExpGoalType').value = exp.goalType || '';
    overlay.querySelector('#editExpGoalValue').value = exp.goalValue || '';

    const variantsInput = overlay.querySelector('#editExpVariants');
    const container = overlay.querySelector('#editVariantContentFields');
    function updateVariantContentFields() {
      const names = variantsInput.value.split(',').map((v) => v.trim()).filter(Boolean);
      container.innerHTML = names
        .map(
          (name, i) => `
        <div class="form-group">
          <label>Content for "${escapeHtml(name)}"</label>
          <input type="text" data-variant-index="${i}" data-variant-name="${escapeHtml(name)}" placeholder="Text or HTML for this variant" value="${escapeHtml((exp.variantContent || {})[name] || '')}" />
        </div>
      `
        )
        .join('');
    }
    variantsInput.addEventListener('input', updateVariantContentFields);
    variantsInput.addEventListener('change', updateVariantContentFields);
    updateVariantContentFields();

    overlay.querySelector('#editExpGoalType').addEventListener('change', function () {
      overlay.querySelector('#editGoalValueGroup').style.display = this.value ? 'block' : 'none';
    });
    overlay.querySelector('#editGoalValueGroup').style.display = overlay.querySelector('#editExpGoalType').value ? 'block' : 'none';

    overlay.querySelector('#editModalCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#editExperimentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = overlay.querySelector('#editExpName').value.trim();
      const selector = overlay.querySelector('#editExpSelector').value.trim();
      const contentType = overlay.querySelector('#editExpContentType').value;
      const variantsText = variantsInput.value.trim();
      const allocationText = overlay.querySelector('#editExpAllocation').value.trim();
      const goalType = overlay.querySelector('#editExpGoalType').value;
      const goalValue = overlay.querySelector('#editExpGoalValue').value.trim();
      const variants = variantsText.split(',').map((v) => v.trim()).filter(Boolean);
      const allocation = allocationText.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
      const variantContent = {};
      container.querySelectorAll('input[data-variant-name]').forEach((input) => {
        const v = input.getAttribute('data-variant-name');
        if (v) variantContent[v] = input.value;
      });
      if (!name || variants.length < 2 || !selector) return;
      if (Object.keys(variantContent).length < 2) {
        alert('Please enter content for at least two variants.');
        return;
      }
      const updated = {
        ...exp,
        name,
        selector,
        contentType: contentType || 'text',
        variants,
        variantContent,
        allocation: allocation.length >= 2 ? allocation : [50, 50],
        goal: goalType === 'selector_click' ? 'Click' : goalType === 'url_contains' ? 'URL' : 'Conversion',
        goalType: goalType || undefined,
        goalValue: goalValue || undefined,
      };
      const { experiments = [] } = await loadStorage();
      const next = experiments.map((e) => (e.id === exp.id ? updated : e));
      await new Promise((r) => chrome.storage.sync.set({ experiments: next }, r));
      renderExperiments(next);
      refreshResults();
      overlay.remove();
    });
  }

  function showNewExperimentModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-wide">
        <h3>New A/B experiment (live test)</h3>
        <form id="newExperimentForm">
          <div class="form-group">
            <label for="expName">Experiment name</label>
            <input type="text" id="expName" placeholder="e.g. Homepage headline test" required />
          </div>
          <div class="form-group">
            <label for="expSelector">CSS selector for element to change</label>
            <input type="text" id="expSelector" placeholder="e.g. h1.title, .hero-headline, #main-heading" required />
          </div>
          <div class="form-group">
            <label for="expContentType">Content type</label>
            <select id="expContentType">
              <option value="text">Text only</option>
              <option value="html">HTML</option>
            </select>
          </div>
          <div class="form-group">
            <label for="expVariants">Variants (comma-separated)</label>
            <input type="text" id="expVariants" placeholder="Control, Variant B" required />
          </div>
          <div id="variantContentFields" class="variant-content-fields"></div>
          <div class="form-group">
            <label for="expAllocation">Variant allocation % (same order as variants)</label>
            <input type="text" id="expAllocation" placeholder="50, 50" value="50, 50" />
          </div>
          <div class="form-group">
            <label for="expGoalType">Goal type</label>
            <select id="expGoalType">
              <option value="">None</option>
              <option value="selector_click">Click on element (CSS selector)</option>
              <option value="url_contains">URL contains (e.g. /thank_you)</option>
            </select>
          </div>
          <div class="form-group" id="goalValueGroup">
            <label for="expGoalValue">Goal value</label>
            <input type="text" id="expGoalValue" placeholder="e.g. button.add-to-cart or /thank_you" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="modalCancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const variantsInput = overlay.querySelector('#expVariants');
    const container = overlay.querySelector('#variantContentFields');
    function updateVariantContentFields() {
      const names = variantsInput.value.split(',').map((v) => v.trim()).filter(Boolean);
      container.innerHTML = names
        .map(
          (name, i) => `
        <div class="form-group">
          <label>Content for "${escapeHtml(name)}"</label>
          <input type="text" data-variant-index="${i}" data-variant-name="${escapeHtml(name)}" placeholder="Text or HTML for this variant" />
        </div>
      `
        )
        .join('');
    }
    variantsInput.addEventListener('input', updateVariantContentFields);
    variantsInput.addEventListener('change', updateVariantContentFields);
    updateVariantContentFields();

    overlay.querySelector('#expGoalType').addEventListener('change', function () {
      overlay.querySelector('#goalValueGroup').style.display = this.value ? 'block' : 'none';
    });
    overlay.querySelector('#goalValueGroup').style.display = 'none';

    overlay.querySelector('#modalCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#newExperimentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = overlay.querySelector('#expName').value.trim();
      const selector = overlay.querySelector('#expSelector').value.trim();
      const contentType = overlay.querySelector('#expContentType').value;
      const variantsText = variantsInput.value.trim();
      const allocationText = overlay.querySelector('#expAllocation').value.trim();
      const goalType = overlay.querySelector('#expGoalType').value;
      const goalValue = overlay.querySelector('#expGoalValue').value.trim();
      const variants = variantsText.split(',').map((v) => v.trim()).filter(Boolean);
      const allocation = allocationText.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
      const variantContent = {};
      container.querySelectorAll('input[data-variant-name]').forEach((input) => {
        const v = input.getAttribute('data-variant-name');
        if (v) variantContent[v] = input.value;
      });
      if (!name || variants.length < 2 || !selector) return;
      if (Object.keys(variantContent).length < 2) {
        alert('Please enter content for at least two variants.');
        return;
      }
      const experiment = {
        id: 'exp_' + Date.now(),
        name,
        selector,
        contentType: contentType || 'text',
        variants,
        variantContent,
        allocation: allocation.length >= 2 ? allocation : [50, 50],
        goal: goalType === 'selector_click' ? 'Click' : goalType === 'url_contains' ? 'URL' : 'Conversion',
        goalType: goalType || undefined,
        goalValue: goalValue || undefined,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      const { experiments = [] } = await loadStorage();
      experiments.push(experiment);
      await new Promise((r) => chrome.storage.sync.set({ experiments }, r));
      renderExperiments(experiments);
      refreshResults();
      overlay.remove();
    });
  }

  openSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('openSettingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  newExperimentBtn.addEventListener('click', showNewExperimentModal);
  runDiagnosticsBtn.addEventListener('click', runDiagnostics);
  refreshResultsBtn.addEventListener('click', () => refreshResults());
  clearResultsBtn.addEventListener('click', () => clearResults());

  async function init() {
    await checkConnection();
    const { experiments = [] } = await loadStorage();
    renderExperiments(experiments);
    await refreshResults();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.experiments) renderExperiments(changes.experiments.newValue || []);
      if (area === 'sync' && (changes.shopDomain || changes.storefrontToken)) checkConnection();
      if (area === 'local' && changes[AB_EVENTS_KEY]) refreshResults();
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url && /myshopify\.com|\.myshopify\.com/.test(tabs[0].url)) {
        chrome.runtime.sendMessage({ type: 'GET_VISUALLY_STATE_TAB', tabId: tabs[0].id }).then(
          (state) => {
            if (state?.experience) {
              visuallyInfo.classList.remove('hidden');
              visuallyInfo.innerHTML = `<strong>Experience:</strong> ${escapeHtml(state.experience)}<br/><strong>Variant:</strong> ${escapeHtml(state.variant || '—')}`;
            }
          },
          () => {}
        );
      }
    });
  }

  init();
})();

