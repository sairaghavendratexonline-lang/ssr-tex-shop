import "server-only";

import {
  CACHE_TAGS,
  STOREFRONT_REVALIDATE_SECONDS,
  productSnapshotCacheKey,
} from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { resolveProductPricing } from "@/lib/products/pricing";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import { products } from "@/lib/supabase/schema";
import type { CartProductPricing } from "@/lib/storefront/cart-pricing";
import { eq } from "drizzle-orm";

type SnapshotRow = {
  id: string;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
};

/** Pure mapper — exported for unit tests (no database). */
export function buildSnapshotPricing(
  row: SnapshotRow | undefined,
): CartProductPricing | null {
  if (!row) return null;
  return { productId: row.id, ...resolveProductPricing(row) };
}

/**
 * Cached PDP price snapshot. Display-only — cart and checkout still load
 * live pricing from the database.
 */
export async function getProductStorefrontSnapshot(
  productId: string,
): Promise<CartProductPricing | null> {
  const id = productId.trim();
  if (!id) return null;

  return withStorefrontCache(
    productSnapshotCacheKey(id),
    async () => {
      const rows = await withRetry(
        () =>
          db
            .select({
              id: products.id,
              price: products.price,
              discountEnabled: products.discountEnabled,
              discountPercent: products.discountPercent,
            })
            .from(products)
            .where(eq(products.id, id))
            .limit(1),
        { label: "product-storefront-snapshot" },
      );

      return buildSnapshotPricing(rows[0]);
    },
    { revalidate: STOREFRONT_REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  );
}
