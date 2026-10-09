import "server-only";

import type { ProductDetailPageQueryQuery } from "@/gql/graphql";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import {
  collections,
  comments,
  medias,
  productMedias,
  products,
  profiles,
} from "@/lib/supabase/schema";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * Plain-object PDP payload in the `ProductDetailPageQuery` shape. GraphQL
 * fragment refs are type-only, so the page components read these fields as-is.
 */
export type ProductDetailPageData = ProductDetailPageQueryQuery;

type Media = { id: string; key: string; alt: string };

function mapMedia(
  id: string | null | undefined,
  key: string | null | undefined,
  alt: string | null | undefined,
): Media | null {
  if (!id || !key) return null;
  return { id, key, alt: alt ?? "" };
}

const productCardSelect = {
  id: products.id,
  name: products.name,
  description: products.description,
  rating: products.rating,
  slug: products.slug,
  badge: products.badge,
  price: products.price,
  discountEnabled: products.discountEnabled,
  discountPercent: products.discountPercent,
  stock: products.stock,
  tags: products.tags,
  totalComments: products.totalComments,
  mediaId: medias.id,
  mediaKey: medias.key,
  mediaAlt: medias.alt,
  collectionId: collections.id,
  collectionLabel: collections.label,
  collectionSlug: collections.slug,
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  rating: string;
  slug: string;
  badge: "new_product" | "best_sale" | "featured" | null;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  mediaId: string | null;
  mediaKey: string | null;
  mediaAlt: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  collectionSlug: string | null;
};

function mapCollection(row: ProductRow) {
  return row.collectionId
    ? {
        id: row.collectionId,
        label: row.collectionLabel ?? "",
        slug: row.collectionSlug ?? "",
      }
    : null;
}

function mapProductCardNode(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rating: row.rating,
    slug: row.slug,
    badge: row.badge,
    price: row.price,
    discountEnabled: row.discountEnabled,
    discountPercent: row.discountPercent,
    stock: row.stock,
    featuredImage: mapMedia(row.mediaId, row.mediaKey, row.mediaAlt),
    collections: mapCollection(row),
  };
}

async function loadPublishedProductRow(slug: string) {
  const [row] = await withRetry(
    () =>
      db
        .select(productCardSelect)
        .from(products)
        .leftJoin(medias, eq(products.featuredImageId, medias.id))
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.slug, slug), eq(products.isDraft, false)))
        .limit(1),
    { label: "pdp:product-shell" },
  );
  return row ?? null;
}

async function loadGalleryImages(productId: string) {
  const rows = await withRetry(
    () =>
      db
        .select({
          mediaId: medias.id,
          mediaKey: medias.key,
          mediaAlt: medias.alt,
        })
        .from(productMedias)
        .innerJoin(medias, eq(productMedias.mediaId, medias.id))
        .where(eq(productMedias.productId, productId))
        .orderBy(sql`${productMedias.priority} desc nulls last`),
    { label: "pdp:product-gallery" },
  );
  return rows
    .map((row) => mapMedia(row.mediaId, row.mediaKey, row.mediaAlt))
    .filter((media): media is Media => media !== null);
}

async function loadRecentComments(productId: string) {
  return withRetry(
    () =>
      db
        .select({
          id: comments.id,
          comment: comments.comment,
          profileName: profiles.name,
        })
        .from(comments)
        .leftJoin(profiles, eq(comments.profileId, profiles.id))
        .where(eq(comments.productId, productId))
        .orderBy(desc(comments.createdAt))
        .limit(5),
    { label: "pdp:comments" },
  );
}

async function loadFeaturedRecommendations(limit: number) {
  const rows = await withRetry(
    () =>
      db
        .select(productCardSelect)
        .from(products)
        .leftJoin(medias, eq(products.featuredImageId, medias.id))
        .leftJoin(collections, eq(products.collectionId, collections.id))
        .where(and(eq(products.isDraft, false), eq(products.featured, true)))
        .orderBy(desc(products.createdAt))
        .limit(limit),
    { label: "pdp:featured-recommendations" },
  );
  return rows.map((row) => mapProductCardNode(row));
}

/**
 * PDP read path: small Drizzle SELECTs run one at a time on the pooled
 * connection instead of a nested pg_graphql query.
 */
export async function loadProductDetailPageFromDb(
  productSlug: string,
): Promise<ProductDetailPageData | null> {
  const slug = productSlug.trim();
  if (!slug) return null;

  const productRow = await loadPublishedProductRow(slug);
  if (!productRow) return null;

  const galleryMedias = await loadGalleryImages(productRow.id);
  const recentComments =
    productRow.totalComments > 0 ? await loadRecentComments(productRow.id) : [];
  const recommendationNodes = await loadFeaturedRecommendations(5);

  const node = {
    id: productRow.id,
    name: productRow.name,
    description: productRow.description,
    rating: productRow.rating,
    price: productRow.price,
    discountEnabled: productRow.discountEnabled,
    discountPercent: productRow.discountPercent,
    stock: productRow.stock,
    tags: productRow.tags,
    totalComments: productRow.totalComments,
    featuredImage: mapMedia(
      productRow.mediaId,
      productRow.mediaKey,
      productRow.mediaAlt,
    ),
    images: {
      edges: galleryMedias.map((media) => ({ node: { media } })),
    },
    commentsCollection: {
      edges: recentComments.map((row) => ({
        node: {
          id: row.id,
          comment: row.comment,
          profile: { name: row.profileName },
        },
      })),
    },
    collections: mapCollection(productRow),
  };

  const data = {
    productsCollection: { edges: [{ node }] },
    recommendations: {
      edges: recommendationNodes
        .filter((rec) => rec.id !== productRow.id)
        .slice(0, 4)
        .map((rec) => ({ node: rec })),
    },
  };

  return data as unknown as ProductDetailPageData;
}
