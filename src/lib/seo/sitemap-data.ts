import {
  CACHE_TAGS,
  STOREFRONT_STATIC_REVALIDATE_SECONDS,
} from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import db from "@/lib/supabase/db";
import { collections, products } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";

export async function getPublishedProductSlugs() {
  try {
    return await withStorefrontCache(
      "sf:sitemap:products",
      () =>
        db
          .select({
            slug: products.slug,
            createdAt: products.createdAt,
          })
          .from(products)
          .where(eq(products.isDraft, false))
          .orderBy(products.createdAt),
      {
        revalidate: STOREFRONT_STATIC_REVALIDATE_SECONDS,
        tags: [CACHE_TAGS.products],
      },
    );
  } catch {
    return [];
  }
}

export async function getCollectionSlugs() {
  try {
    return await withStorefrontCache(
      "sf:sitemap:collections",
      () =>
        db
          .select({
            slug: collections.slug,
            label: collections.label,
          })
          .from(collections)
          .orderBy(collections.order),
      {
        revalidate: STOREFRONT_STATIC_REVALIDATE_SECONDS,
        tags: [CACHE_TAGS.collections],
      },
    );
  } catch {
    return [];
  }
}
