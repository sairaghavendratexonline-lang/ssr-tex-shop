/** Default ISR TTL for storefront pages and route handlers (seconds). */
export const STOREFRONT_REVALIDATE_SECONDS = 300;

/**
 * Freshness of storefront data in Redis / the Data Cache (30 minutes).
 * Admin and Velo writes still clear it immediately.
 */
export const STOREFRONT_DATA_REVALIDATE_SECONDS = 1800;

/** Longer TTL for mostly-static marketing pages. */
export const STOREFRONT_STATIC_REVALIDATE_SECONDS = 3600;

/**
 * Data Cache tags. Per-product entries also carry their group tag, so a full
 * storefront bust (every value here) still reaches them.
 */
export const CACHE_TAGS = {
  /** Anything listing several products: search, featured, collections, landing. */
  products: "storefront-products",
  productDetails: "storefront-product-details",
  drafts: "storefront-product-drafts",
  sizeConfig: "storefront-size-config",
  sizeBatch: "storefront-size-batch",
  settings: "storefront-settings",
  collections: "storefront-collections",
} as const;

export const productDetailCacheTag = (slug: string) =>
  `storefront-product:${slug}`;

export const productSizeCacheTag = (productId: string) =>
  `storefront-size:${productId}`;
