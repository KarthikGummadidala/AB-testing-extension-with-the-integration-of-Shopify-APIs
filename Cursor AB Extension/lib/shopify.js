/**
 * Shopify Storefront API helpers for the extension.
 */

const SHOPIFY_STOREFRONT_API_VERSION = '2024-01';

async function storefrontGraphQL(shopDomain, storefrontToken, query, variables = null) {
  const url = `https://${shopDomain}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getShopName(shopDomain, storefrontToken) {
  const result = await storefrontGraphQL(
    shopDomain,
    storefrontToken,
    `query { shop { name } }`
  );
  return result?.data?.shop?.name || null;
}

async function getProducts(shopDomain, storefrontToken, first = 10) {
  const result = await storefrontGraphQL(
    shopDomain,
    storefrontToken,
    `query GetProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }`,
    { first }
  );
  const edges = result?.data?.products?.edges || [];
  return edges.map((e) => e.node);
}

if (typeof window !== 'undefined') {
  window.ShopifyStorefront = { storefrontGraphQL, getShopName, getProducts };
}

