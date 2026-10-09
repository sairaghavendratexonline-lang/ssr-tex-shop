"use client";

import { DocumentType } from "@/gql";
import { CollectionCardFragment } from "@/features/collections";
import { CollectionCardSurface } from "@/features/collections/components/CollectionCardSurface";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { keytoUrl } from "@/lib/utils";
import { collectionImageTransitionName } from "@/lib/view-transitions";
import { HomeSectionHeader } from "./HomeSectionHeader";
import {
  HomeScrollSnapStrip,
  ScrollSnapItem,
  scrollSnapCategoryItemClass,
} from "./HomeScrollSnapStrip";

type CollectionNode = DocumentType<typeof CollectionCardFragment>;

type Props = {
  collections: { node: CollectionNode }[];
};

/** First section below the hero: plain markup so framer-motion stays out of the initial bundle. */
export function HomeCategoriesCarousel({ collections }: Props) {
  if (!collections.length) return null;

  return (
    <section className="w-full min-w-0 py-4 sm:py-8 md:py-10">
      <HomeSectionHeader
        title="Product"
        titleAccent="Categories"
        href="/collections"
      />
      <HomeScrollSnapStrip ariaLabel="Product categories">
        {collections.map(({ node }, index) => (
          <ScrollSnapItem key={node.id} className={scrollSnapCategoryItemClass}>
            <ViewTransitionLink
              href={`/collections/${node.slug}`}
              className="group block w-full overflow-hidden rounded-[1.25rem] border border-primary/15 bg-muted/30 shadow-sm transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_40px_-18px_rgba(107,24,88,0.45)]"
            >
              <CollectionCardSurface
                label={node.label}
                imageSrc={keytoUrl(node.featuredImage.key)}
                imageAlt={node.featuredImage.alt || node.label}
                aspectClass="aspect-[5/3] sm:aspect-[16/10]"
                sizes="(max-width: 640px) 82vw, (max-width: 1024px) 44vw, 360px"
                priority={index < 2}
                viewTransitionName={collectionImageTransitionName(node.id)}
              />
            </ViewTransitionLink>
          </ScrollSnapItem>
        ))}
      </HomeScrollSnapStrip>
    </section>
  );
}
