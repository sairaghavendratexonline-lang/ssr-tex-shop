import db from "@/lib/supabase/db";
import { medias, products, wishlist } from "@/lib/supabase/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DocumentType } from "@/gql";
import { ProductCardFragment } from "@/features/products/components/ProductCard";
import {
  orderWishlistProductIds,
  uniqueWishlistProductIds,
} from "@/lib/storefront/wishlist-ids";

export type WishlistProductView = DocumentType<typeof ProductCardFragment> & {
  wishlistedAt?: string;
};

function toCardProduct(row: {
  id: string;
  name: string;
  rating: string | number;
  slug: string;
  badge: string | null;
  price: string | number;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  mediaId: string | null;
  mediaKey: string | null;
  mediaAlt: string | null;
  wishlistedAt?: string;
}): WishlistProductView {
  return {
    id: row.id,
    name: row.name,
    rating: Number(row.rating),
    slug: row.slug,
    badge: row.badge as WishlistProductView["badge"],
    price: row.price as WishlistProductView["price"],
    discountEnabled: row.discountEnabled,
    discountPercent: row.discountPercent,
    stock: row.stock,
    featuredImage: {
      id: row.mediaId ?? "missing",
      key: row.mediaKey ?? "",
      alt: row.mediaAlt,
    },
    collections: [] as unknown as WishlistProductView["collections"],
    wishlistedAt: row.wishlistedAt,
  };
}

/** Published products for the given IDs (drafts omitted). Order follows `productIds`. */
export async function getPublishedWishlistProductsByIds(
  productIds: string[],
): Promise<WishlistProductView[]> {
  const uniqueIds = uniqueWishlistProductIds(productIds).slice(0, 100);
  if (uniqueIds.length === 0) return [];

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      rating: products.rating,
      slug: products.slug,
      badge: products.badge,
      price: products.price,
      discountEnabled: products.discountEnabled,
      discountPercent: products.discountPercent,
      stock: products.stock,
      mediaId: medias.id,
      mediaKey: medias.key,
      mediaAlt: medias.alt,
    })
    .from(products)
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(and(inArray(products.id, uniqueIds), eq(products.isDraft, false)));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const orderedIds = orderWishlistProductIds(
    uniqueIds,
    rows.map((row) => row.id),
  );

  return orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => toCardProduct(row));
}

/** DB wishlist for a signed-in user — source of truth across devices/sessions. */
export async function getWishlistProductsForUser(
  userId: string,
): Promise<WishlistProductView[]> {
  const trimmed = userId.trim();
  if (!trimmed) return [];

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      rating: products.rating,
      slug: products.slug,
      badge: products.badge,
      price: products.price,
      discountEnabled: products.discountEnabled,
      discountPercent: products.discountPercent,
      stock: products.stock,
      mediaId: medias.id,
      mediaKey: medias.key,
      mediaAlt: medias.alt,
      wishlistedAt: wishlist.createdAt,
    })
    .from(wishlist)
    .innerJoin(products, eq(wishlist.productId, products.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(and(eq(wishlist.userId, trimmed), eq(products.isDraft, false)))
    .orderBy(desc(wishlist.createdAt));

  return rows.map((row) => toCardProduct(row));
}

/** Product IDs currently on a user's DB wishlist. */
export async function getWishlistProductIdsForUser(
  userId: string,
): Promise<string[]> {
  const trimmed = userId.trim();
  if (!trimmed) return [];
  const rows = await db
    .select({ productId: wishlist.productId })
    .from(wishlist)
    .where(eq(wishlist.userId, trimmed));
  return rows.map((row) => row.productId);
}
