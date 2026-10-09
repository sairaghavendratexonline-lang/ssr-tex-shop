"use client";

import dynamic from "next/dynamic";

/**
 * Non-critical store chrome: load in the browser only so every storefront
 * render ships less server HTML and JS. Behaviour is unchanged after hydrate.
 */
const CartSheet = dynamic(
  () => import("@/features/carts").then((mod) => mod.CartSheet),
  { ssr: false },
);

const StoreFloatingActions = dynamic(
  () =>
    import("@/components/layouts/StoreFloatingActions").then(
      (mod) => mod.StoreFloatingActions,
    ),
  { ssr: false },
);

export function StoreDeferredChrome() {
  return (
    <>
      <CartSheet />
      <StoreFloatingActions />
    </>
  );
}
