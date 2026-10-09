import { Shell } from "@/components/layouts/Shell";
import { Icons } from "@/components/layouts/icons";
import { HomeHeroCarousel } from "@/features/storefront/components/HomeHeroCarousel";
import { HomeCategoriesCarousel } from "@/features/storefront/components/HomeCategoriesCarousel";
import { HomeExploreLinks } from "@/features/storefront/components/HomeExploreLinks";
import dynamic from "next/dynamic";
import { heroSlides } from "@/config/heroSlides";
import { getHomeBannerSlides } from "@/lib/integrations/settings";
import { withTimeoutFallback } from "@/lib/resilience";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import { getLandingPageDataCached } from "@/lib/storefront/landing-data";
import { getShopByPriceBucketsCached } from "@/lib/storefront/shop-by-price";
import { resolveStorefrontContact } from "@/lib/integrations/settings";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import type { Metadata } from "next";

// Below-the-fold sections (framer-motion heavy) load as separate chunks.
const HomePriceCarousel = dynamic(() =>
  import("@/features/storefront/components/HomePriceCarousel").then(
    (mod) => mod.HomePriceCarousel,
  ),
);
const HomeShoppableReels = dynamic(() =>
  import("@/features/storefront/components/HomeShoppableReels").then(
    (mod) => mod.HomeShoppableReels,
  ),
);
const HomeTestimonialsCarousel = dynamic(() =>
  import("@/features/storefront/components/HomeTestimonialsCarousel").then(
    (mod) => mod.HomeTestimonialsCarousel,
  ),
);

export const revalidate = STOREFRONT_REVALIDATE_SECONDS;

export const metadata: Metadata = {
  title: "SRI SAI RAGHAVENDRA TEX | Premium Silk & Cotton Sarees Online",
  description:
    "Shop authentic silk and cotton sarees at SRI SAI RAGHAVENDRA TEX. Explore featured sarees, wedding collections, Kanjivaram styles, and wholesale sarees from Salem.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SRI SAI RAGHAVENDRA TEX | Premium Silk & Cotton Sarees Online",
    description:
      "Shop authentic silk and cotton sarees at SRI SAI RAGHAVENDRA TEX. Explore featured sarees, wedding collections, and wholesale sarees from Salem.",
    url: "/",
  },
};

const SECTION_TIMEOUT_MS = 5000;

export default async function Home() {
  const [homeBannerSlides, data, draftProductIds, contact, priceBuckets] =
    await Promise.all([
      withTimeoutFallback(
        "home:banner",
        getHomeBannerSlides(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      withTimeoutFallback(
        "home:landing",
        getLandingPageDataCached(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      withTimeoutFallback<string[] | null>(
        "home:drafts",
        getDraftProductIdsSafe(),
        SECTION_TIMEOUT_MS,
        null,
      ),
      resolveStorefrontContact(),
      withTimeoutFallback(
        "home:price-buckets",
        getShopByPriceBucketsCached(),
        SECTION_TIMEOUT_MS,
        [],
      ),
    ]);

  const draftIds = new Set(draftProductIds ?? []);
  const products = data?.products;
  const featuredProducts =
    products?.edges?.filter((edge) => !draftIds.has(edge.node.id)) ?? [];
  const collectionScrollCards = data?.collectionScrollCards;
  const homeTestimonials = data?.homeTestimonials;
  const slides = homeBannerSlides?.length ? homeBannerSlides : heroSlides;

  return (
    <main className="min-h-screen w-full min-w-0 overflow-x-hidden">
      <HomeHeroCarousel slides={slides} />

      <Shell>
        {!data ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 my-6 text-sm">
            <p className="font-semibold mb-2">Store data not loaded</p>
            <p className="text-muted-foreground mb-2">
              Enable GraphQL in Supabase: SQL Editor → run{" "}
              <code className="bg-white px-1">
                supabase/02-enable-graphql.sql
              </code>
            </p>
          </div>
        ) : null}

        {collectionScrollCards?.edges?.length ? (
          <HomeCategoriesCarousel collections={collectionScrollCards.edges} />
        ) : null}

        {priceBuckets.length ? (
          <HomePriceCarousel buckets={priceBuckets} />
        ) : null}

        {featuredProducts.length ? (
          <HomeShoppableReels products={featuredProducts} />
        ) : null}

        {homeTestimonials?.edges?.length ? (
          <HomeTestimonialsCarousel testimonials={homeTestimonials.edges} />
        ) : null}

        <HomeExploreLinks />
        <TrustFeatures phone={contact.phone} />
      </Shell>
    </main>
  );
}

function TrustFeatures({ phone }: { phone: string }) {
  const features = [
    {
      Icon: Icons.package,
      title: "Affordable Shipping",
      description: "Low delivery charges for orders across India.",
    },
    {
      Icon: Icons.cart,
      title: "Contact Support",
      description: `Call ${phone} or email us anytime.`,
    },
    {
      Icon: Icons.tag,
      title: "Easy Replacement",
      description: "Simple returns on eligible items.",
    },
    {
      Icon: Icons.award,
      title: "Secure Checkout",
      description: "Safe, trusted payment flow.",
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-10 py-10 md:py-16 border-t">
      {features.map(({ Icon, title, description }, index) => (
        <div className="text-center px-2" key={`trust_${index}`}>
          <div className="flex justify-center mb-3">
            <Icon className="h-9 w-9 text-primary/80" />
          </div>
          <h4 className="text-sm md:text-base font-semibold mb-1">{title}</h4>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      ))}
    </section>
  );
}
