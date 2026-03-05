/**
 * Background service worker for A/B Testing extension.
 * Handles messages, optional Shopify API proxying, Visually detection,
 * and enabling/disabling the action based on the current tab URL.
 */

function isShopifyUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /\.myshopify\.com$/i.test(u.hostname) || /(^|\.)(myshopify\.com)$/i.test(u.hostname);
  } catch (_) {
    return false;
  }
}

function updateActionForTab(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  if (isShopifyUrl(tab.url)) {
    chrome.action.enable(tab.id);
  } else {
    chrome.action.disable(tab.id);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    updateActionForTab(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateActionForTab(tab);
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) updateActionForTab(tabs[0]);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) updateActionForTab(tabs[0]);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'GET_VISUALLY_STATE_TAB') {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ experience: null, variant: null });
      return true;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            // Visually docs: experience/variant are exposed on _USE_CASE_CTX
            // https://help.visually.io/retrieve-the-experience-name-variant-using-javascript
            // eslint-disable-next-line no-undef
            if (typeof _USE_CASE_CTX !== 'undefined') {
              // eslint-disable-next-line no-undef
              return { experience: _USE_CASE_CTX._USE_CASE_GA || null, variant: _USE_CASE_CTX._USE_CASE_GA_VARIANT || null };
            }
          } catch (_) {}
          return { experience: null, variant: null };
        },
      },
      (results) => {
        const r = results && results[0] && results[0].result ? results[0].result : { experience: null, variant: null };
        sendResponse(r);
      }
    );
    return true;
  }
  if (message.type === 'SHOPIFY_GRAPHQL') {
    const { shopDomain, storefrontToken, query, variables } = message.payload || {};
    if (!shopDomain || !storefrontToken || !query) {
      sendResponse({ error: 'Missing shopDomain, storefrontToken, or query' });
      return true;
    }
    const url = `https://${shopDomain}/api/2024-01/graphql.json`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({ query, variables: variables || null }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ data }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  return false;
});

