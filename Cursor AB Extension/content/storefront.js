/**
 * Content script: client-side A/B engine (Shopify storefronts).
 * - Runs experiments: assigns variant, applies DOM changes, records impressions/conversions.
 * - Responds to AB_DIAGNOSTICS for popup diagnostics.
 */

(function () {
  const AB_EVENTS_KEY = 'ab_events';
  const MAX_EVENTS = 5000;

  function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return h >>> 0;
  }

  function assignVariantIndex(visitorId, experimentId, allocation) {
    const sum = allocation.reduce((a, b) => a + b, 0);
    const normalized = sum ? allocation.map((p) => Math.round((p / sum) * 100)) : allocation.map(() => Math.floor(100 / allocation.length));
    const buckets = [];
    let cum = 0;
    for (const p of normalized) {
      cum += p;
      buckets.push(cum);
    }
    const hash = hashString(experimentId + '\0' + visitorId) % 100;
    for (let i = 0; i < buckets.length; i++) {
      if (hash < buckets[i]) return i;
    }
    return Math.max(0, buckets.length - 1);
  }

  function getOrCreateVisitorId() {
    try {
      let id = localStorage.getItem('ab_visitor_id');
      if (!id) {
        id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('ab_visitor_id', id);
      }
      return id;
    } catch (_) {
      return 'v_anon_' + Math.random().toString(36).slice(2, 11);
    }
  }

  function getStoredAssignment(experimentId) {
    try {
      const raw = localStorage.getItem('ab_assignment_' + experimentId);
      return raw === null ? null : parseInt(raw, 10);
    } catch (_) {
      return null;
    }
  }

  function setStoredAssignment(experimentId, variantIndex) {
    try {
      localStorage.setItem('ab_assignment_' + experimentId, String(variantIndex));
    } catch (_) {}
  }

  async function getExperiments() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['experiments'], (data) => resolve(data.experiments || []));
    });
  }

  async function appendEvent(evt) {
    return new Promise((resolve) => {
      chrome.storage.local.get([AB_EVENTS_KEY], (data) => {
        const list = data[AB_EVENTS_KEY] || [];
        list.push(evt);
        const trimmed = list.slice(-MAX_EVENTS);
        chrome.storage.local.set({ [AB_EVENTS_KEY]: trimmed }, resolve);
      });
    });
  }

  function canRunExperiment(exp) {
    return exp && exp.selector && exp.variantContent && typeof exp.variantContent === 'object' && exp.variants && exp.variants.length >= 2 && (exp.enabled !== false);
  }

  function applyVariant(el, content, contentType) {
    if (!el) return;
    if (contentType === 'html') {
      el.innerHTML = content;
    } else {
      el.textContent = content;
    }
  }

  function runExperiments() {
    getExperiments().then((experiments) => {
      const visitorId = getOrCreateVisitorId();
      const toRun = experiments.filter(canRunExperiment);

      toRun.forEach((exp) => {
        const el = document.querySelector(exp.selector);
        if (el) {
          const allocation = (exp.allocation && exp.allocation.length >= 2) ? exp.allocation : [50, 50];
          let variantIndex = getStoredAssignment(exp.id);
          if (variantIndex === null) {
            variantIndex = assignVariantIndex(visitorId, exp.id, allocation);
            setStoredAssignment(exp.id, variantIndex);
          }
          const variantName = exp.variants[variantIndex] || exp.variants[0];
          const content = exp.variantContent[variantName] != null ? String(exp.variantContent[variantName]) : (exp.variantContent[exp.variants[0]] || '');

          applyVariant(el, content, exp.contentType || 'text');
          appendEvent({ experimentId: exp.id, variant: variantName, type: 'impression', timestamp: Date.now() });
          try {
            localStorage.setItem('ab_last_seen', JSON.stringify({ experimentId: exp.id, variant: variantName }));
          } catch (_) {}

          if (exp.goalType === 'selector_click' && exp.goalValue) {
            document.addEventListener('click', function goalClick(e) {
              const target = e.target.closest(exp.goalValue);
              if (target) {
                appendEvent({ experimentId: exp.id, variant: variantName, type: 'conversion', timestamp: Date.now() });
                document.removeEventListener('click', goalClick);
              }
            }, true);
          }
        }
      });

      const urlGoalExperiments = toRun.filter((e) => e.goalType === 'url_contains' && e.goalValue);
      if (urlGoalExperiments.length > 0) {
        const converted = new Set();
        function checkUrl() {
          const href = window.location.href;
          urlGoalExperiments.forEach((e) => {
            if (href.indexOf(e.goalValue) !== -1 && !converted.has(e.id)) {
              converted.add(e.id);
              let variantName = null;
              const idx = getStoredAssignment(e.id);
              if (idx !== null && e.variants && e.variants[idx] != null) {
                variantName = e.variants[idx];
              }
              if (variantName == null) {
                try {
                  const last = JSON.parse(localStorage.getItem('ab_last_seen') || '{}');
                  if (last.experimentId === e.id) variantName = last.variant;
                } catch (_) {}
              }
              if (variantName == null) variantName = e.variants && e.variants[0] ? e.variants[0] : 'unknown';
              appendEvent({ experimentId: e.id, variant: variantName, type: 'conversion', timestamp: Date.now() });
            }
          });
        }
        checkUrl();
        const observer = new MutationObserver(checkUrl);
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('popstate', checkUrl);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runExperiments);
  } else {
    runExperiments();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'AB_DIAGNOSTICS') {
      getExperiments().then((experiments) => {
        const visitorId = getOrCreateVisitorId();
        const all = experiments || [];
        const runnable = all.filter(canRunExperiment);
        const details = all.map((exp) => {
          const runnableFlag = canRunExperiment(exp);
          const el = document.querySelector(exp.selector);
          const storedIdx = getStoredAssignment(exp.id);
          const allocation = (exp.allocation && exp.allocation.length >= 2) ? exp.allocation : [50, 50];
          const computedIdx = runnableFlag ? assignVariantIndex(visitorId, exp.id, allocation) : 0;
          return {
            id: exp.id,
            name: exp.name,
            selector: exp.selector,
            runnable: runnableFlag,
            selectorMatched: !!el,
            storedVariant: storedIdx === null ? null : (exp.variants[storedIdx] || exp.variants[0]),
            computedVariant: (exp.variants && exp.variants[computedIdx]) || (exp.variants && exp.variants[0]) || null,
            goalType: exp.goalType || null,
            goalValue: exp.goalValue || null,
          };
        });
        sendResponse({
          url: window.location.href,
          visitorId,
          experimentsTotal: all.length,
          experimentsRunnable: runnable.length,
          runnableDetails: details,
        });
      });
      return true;
    }
    return false;
  });
})();

