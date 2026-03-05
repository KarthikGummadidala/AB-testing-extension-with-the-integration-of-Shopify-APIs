# A/B Testing Extension – Shopify

Chrome extension that combines **Shopify** store integration. Manage experiments, connect your store via Shopify APIs, run a client-side A/B engine, and optionally detect Visually experiences on storefronts.

## Features

- **Shopify integration**
  - Connect your store using **Storefront API** (public token) and optional **Admin API** token.
  - Storefront API: products, shop name, etc. (works from the browser).
  - Admin API: use a custom app token in Settings for product/order data (optional).
- **Real client-side A/B engine**
  - Create **live** experiments: set a **CSS selector** (e.g. `h1.title`), define **content per variant** (text or HTML), and **allocation** (e.g. 50/50). On your storefront the extension assigns each visitor to a variant (stored in localStorage), replaces the element’s content, and records **impressions**.
  - **Goals**: track **conversions** by “click on element” (e.g. `button.add-to-cart`) or “URL contains” (e.g. `/thank_you`). Results show **impressions**, **conversions**, and **conversion rate** per variant.
  - **Diagnostics**: run diagnostics to see experiment results (Experiment | Variant | Impressions | Conversions | Rate), current page URL, visitor ID, and which experiments match on the current page.
  - **Clear**: remove all stored experiment data (with confirmation to avoid accidental loss).
  - Experiments and events are stored locally (`chrome.storage.sync` and `chrome.storage.local`). Works on Shopify storefronts (`*.myshopify.com`).
- **Visually integration**
  - On storefronts where [Visually](https://apps.shopify.com/visually-io) is installed, the extension can read the **current experience name and variant** from the page (via `_USE_CASE_CTX`).
  - No Visually API key required for this read-only detection.
  - [Visually for Developers](https://help.visually.io/visually-for-developers) docs: custom goals, GTM, anti-flicker, etc.

## Setup

### 1. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (`Cursor AB Extension`).

### 2. Configure Shopify

1. Click the extension icon → **Configure store** (or open **Options** from the extension menu).
2. **Store domain**: your store's myshopify domain (e.g. `mystore` or `mystore.myshopify.com`).
3. **Storefront API access token** (required):

   Shopify's store admin has changed: **Apps** and **Sales channel(s)** are separate sections, and **Apps → Develop apps** now sends you to the **Dev Dashboard** (dev.shopify.com), which does not give you a single token to copy for this extension. Use the **Headless** sales channel instead—it gives you a Storefront API token you can copy.

   **Get the token (Headless channel):**
   - In your **store admin** (the merchant dashboard for your shop), go to **Sales channels** (or the **Sales channel** section in the left/side navigation).
   - Click **Headless**. If you don't see it, add it first: open the **Shopify App Store**, search for **Headless**, install the **Headless** channel.
   - In Headless, click **Create storefront**. Shopify will generate Storefront API access tokens. Copy the token (if both public and private are shown, use the **public** one—the extension runs in the browser). Paste it into the extension as **Storefront API access token**.
   - Optional: under **Storefront API permissions** → **Edit**, enable the scopes you need (e.g. product listings). Then paste the token into the extension's Options.

   **If you used "Develop apps" / Dev Dashboard:** The Dev Dashboard is for building full apps and uses Client ID + Client Secret with token exchange; it does not show a copyable Storefront API token. Stick to the Headless channel above for this extension.

4. **Admin API access token** (optional): if you need Admin API access, use the Dev Dashboard app (Settings → Client ID and Client secret, then exchange for a token programmatically). The extension uses the Storefront API for the connection check.

### 3. Visually (optional)

- Install [Visually](https://apps.shopify.com/visually-io) on your store if you use it for A/B tests.
- When you open a storefront page that has an active Visually experience, the extension popup will show the current **experience** and **variant** (read from the page).

## Usage

### Popup

- **Shopify store**: connection status (green dot = connected, store name).
- **Experiments**: list of experiments with **Edit** and **Delete**. Click **+ New** to create a live experiment.
- **Results**: table of Experiment | Variant | Impressions | Conversions | Rate. Use **Diagnostics**, **Refresh**, or **Clear**.
- **Visually**: shows current experience and variant when on a storefront with Visually installed.

### Diagnostics

Click **Diagnostics** in the Results section to see:

- **Experiment results**: table of Experiment | Variant | Impressions | Conversions | Rate (same as Results).
- **URL**: current tab URL.
- **Visitor**: visitor ID (from localStorage).
- **Experiments on this page**: which experiments are runnable and whether their selector matched (YES/NO), plus stored/computed variant.

Use this to verify why an experiment might not be recording impressions (e.g. selector not matching).

### Clear

Click **Clear** to permanently delete all experiment data (`ab_events`). A confirmation dialog appears before deletion. Use this to reset results.

### Creating an experiment

1. Click **+ New** under Experiments.
2. **Experiment name**: e.g. `Homepage headline test`.
3. **CSS selector for element to change**: e.g. `h1.title`, `.hero__title`, `#main-heading` (must match an element on your storefront—use DevTools Inspect to find the correct selector).
4. **Content type**: Text only or HTML.
5. **Variants**: comma-separated, e.g. `Control, Variant B`.
6. **Content for each variant**: the text or HTML to display for each variant.
7. **Allocation**: e.g. `50, 50` (percentage split).
8. **Goal type** (optional): None, “Click on element” (CSS selector), or “URL contains” (string).
9. **Goal value** (if goal set): e.g. `button.add-to-cart` or `/thank_you`.
10. Click **Create**.

**Tip:** Use a specific CSS selector (e.g. `.hero__title` for homepage only) so the experiment doesn’t run on every page (e.g. product titles). Generic selectors like `h1` can overwrite headings site-wide.

## How to verify the extension is working

| Check | What to do | Expected result |
|-------|------------|-----------------|
| API connection | Options → Save (with token filled) | Green message: "Storefront API OK: [store-name]" |
| Popup connection | Open extension popup | Green dot + store name |
| Experiments | Popup → + New → add selector + variant content → Create | New experiment appears with “· Live” |
| Live test | Open storefront URL; element content changes by variant | Results show impressions/conversions per variant |
| Diagnostics | Open storefront tab → Popup → Diagnostics | Table with Experiment, Variant, Impressions, Conversions, Rate; URL; Visitor; per-page experiment details |

If all of the above behave as expected, the extension is working correctly.

## Tech stack

- **Manifest V3** Chrome extension.
- **Shopify**: Storefront API (GraphQL 2024-01) and optional Admin API.
- **Storage**: `chrome.storage.sync` (experiments, config), `chrome.storage.local` (ab_events, up to 5000 events).

## Project structure

```
Cursor AB Extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── background/
│   └── background.js
├── content/
│   └── storefront.js
├── lib/
│   └── shopify.js
└── README.md
```

## Links

- [Shopify Storefront API](https://shopify.dev/docs/api/storefront)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-rest)

