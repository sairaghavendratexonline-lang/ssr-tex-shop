import MainFooter from "@/components/layouts/MainFooter";
import { MobileMenuProvider } from "@/components/layouts/MobileMenuContext";
import { MobileSearchProvider } from "@/components/layouts/MobileSearchContext";
import { MobileSearchOverlay } from "@/components/layouts/MobileSearchOverlay";
import Navbar from "@/components/layouts/MainNavbar";
import { StoreHeaderMetrics } from "@/components/layouts/StoreHeaderMetrics";
import { StoreDeferredChrome } from "@/components/layouts/StoreDeferredChrome";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { resolveStorefrontRuntimeBundle } from "@/lib/integrations/settings";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import {
  buildOrganizationJsonLd,
  buildSiteNavigationJsonLd,
  buildStoreJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo/json-ld";
import { AnnouncementsProvider } from "@/providers/AnnouncementsProvider";
import { BulkOrderGuardProvider } from "@/providers/BulkOrderGuardProvider";
import { CourierChargesProvider } from "@/providers/CourierChargesProvider";
import { OfferCodesProvider } from "@/providers/OfferCodesProvider";
import { ShopContactProvider } from "@/providers/ShopContactProvider";
import { SocialLinksProvider } from "@/providers/SocialLinksProvider";
import { StockControlProvider } from "@/providers/StockControlProvider";
import { ReactNode } from "react";

type Props = { children: ReactNode };

export const revalidate = STOREFRONT_REVALIDATE_SECONDS;

async function StoreLayout({ children }: Props) {
  const {
    contact,
    social,
    announcements,
    bulkOrderGuard,
    stockControl,
    courierCharges,
    offerCodes,
  } = await resolveStorefrontRuntimeBundle();

  return (
    <SocialLinksProvider social={social}>
      <ShopContactProvider contact={contact}>
        <JsonLd
          data={[
            buildOrganizationJsonLd(),
            buildWebsiteJsonLd(),
            buildStoreJsonLd(),
            buildSiteNavigationJsonLd(),
          ]}
        />
        <AnnouncementsProvider announcements={announcements}>
          <BulkOrderGuardProvider config={bulkOrderGuard}>
            <StockControlProvider config={stockControl}>
              <CourierChargesProvider config={courierCharges}>
                <OfferCodesProvider config={offerCodes}>
                  <MobileMenuProvider>
                    <MobileSearchProvider>
                      <StoreHeaderMetrics />
                      <Navbar />
                      <MobileSearchOverlay />
                      <main className="w-full max-w-[100vw] overflow-x-hidden pt-[var(--store-header-offset-mobile)] md:pt-[var(--store-header-offset-desktop)] pb-[var(--mobile-nav-height)] md:pb-0">
                        {children}
                      </main>
                      <StoreDeferredChrome />
                      <MobileBottomNav />
                      <div className="md:contents pb-[var(--mobile-nav-height)] md:pb-0">
                        <MainFooter />
                      </div>
                    </MobileSearchProvider>
                  </MobileMenuProvider>
                </OfferCodesProvider>
              </CourierChargesProvider>
            </StockControlProvider>
          </BulkOrderGuardProvider>
        </AnnouncementsProvider>
      </ShopContactProvider>
    </SocialLinksProvider>
  );
}

export default StoreLayout;
