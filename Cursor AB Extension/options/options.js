(function () {
  const shopDomain = document.getElementById('shopDomain');
  const storefrontToken = document.getElementById('storefrontToken');
  const adminToken = document.getElementById('adminToken');
  const saveShopify = document.getElementById('saveShopify');
  const shopifySaveStatus = document.getElementById('shopifySaveStatus');
  const shopifyTestResult = document.getElementById('shopifyTestResult');

  function normalizeDomain(value) {
    const v = (value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (v.endsWith('.myshopify.com')) return v;
    if (v && !v.includes('.')) return v + '.myshopify.com';
    return v;
  }

  function load() {
    chrome.storage.sync.get(['shopDomain', 'storefrontToken', 'adminToken', 'experiments'], (data) => {
      shopDomain.value = data.shopDomain || '';
      storefrontToken.value = data.storefrontToken || '';
      adminToken.value = data.adminToken || '';
      if (data.experiments && data.experiments.length) {
        const list = document.getElementById('experimentListOptions');
        list.innerHTML = '<p class="hint">' + data.experiments.length + ' experiment(s) saved. Manage them from the extension popup.</p>';
      }
    });
  }

  function showSaveStatus(text, isSuccess) {
    shopifySaveStatus.textContent = text;
    shopifySaveStatus.className = 'save-status' + (isSuccess ? ' success' : '');
    setTimeout(() => {
      shopifySaveStatus.textContent = '';
    }, 3000);
  }

  function showTestResult(message, success) {
    shopifyTestResult.textContent = message;
    shopifyTestResult.className = 'test-result visible ' + (success ? 'success' : 'error');
  }

  saveShopify.addEventListener('click', async () => {
    const domain = normalizeDomain(shopDomain.value);
    const storefront = (storefrontToken.value || '').trim();
    const admin = (adminToken.value || '').trim();
    if (!domain || !storefront) {
      showSaveStatus('Enter domain and Storefront token.', false);
      return;
    }
    await new Promise((r) =>
      chrome.storage.sync.set(
        {
          shopDomain: domain,
          storefrontToken: storefront,
          adminToken: admin || undefined,
        },
        r
      )
    );
    showSaveStatus('Saved.', true);

    try {
      const res = await fetch(`https://${domain}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefront,
        },
        body: JSON.stringify({ query: 'query { shop { name } }' }),
      });
      const data = await res.json();
      if (data?.data?.shop) {
        showTestResult('Storefront API OK: ' + (data.data.shop.name || domain), true);
      } else {
        showTestResult('Storefront API error: ' + (data?.errors?.[0]?.message || res.status), false);
      }
    } catch (e) {
      showTestResult('Request failed: ' + e.message, false);
    }
  });

  load();
})();

