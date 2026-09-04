"use client";

import useCartStore, { type CartItems } from "@/features/carts/useCartStore";
import { readClientCartCookie } from "@/features/carts/read-client-cart-cookie";
import {
  clearAuthCartClearedMarker,
  hasAuthCartClearedForUser,
} from "@/features/carts/cart-cleared-marker";
import { clearPersistedCartStorage } from "@/features/carts/clear-persisted-cart";
import {
  cartHasLines,
  decideGuestCartMerge,
} from "@/features/carts/guest-cart-merge";
import { useToast } from "@/components/ui/use-toast";
import type { AuthUser, Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import useWishlistStore from "@/features/wishlists/useWishlistStore";

type SupabaseAuthContextType = {
  user: AuthUser | null;
  session: Session | null;
};

const SupabaseAuthContext = createContext<SupabaseAuthContextType>({
  user: null,
  session: null,
});

export const useAuth = () => {
  const client = useContext(SupabaseAuthContext);
  return client;
};

interface SupabaseAuthProviderProps {
  children: React.ReactNode;
}

const WELCOME_TOAST_KEY = "auth:welcomed-user-id";
const MERGED_GUEST_CART_KEY = "auth:merged-guest-cart-user-id";

function hasWelcomedInSession(userId: string) {
  try {
    return sessionStorage.getItem(WELCOME_TOAST_KEY) === userId;
  } catch {
    return false;
  }
}

function markWelcomedInSession(userId: string) {
  try {
    sessionStorage.setItem(WELCOME_TOAST_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function clearWelcomedInSession() {
  try {
    sessionStorage.removeItem(WELCOME_TOAST_KEY);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function markGuestCartMergedForUser(userId: string) {
  try {
    sessionStorage.setItem(MERGED_GUEST_CART_KEY, userId);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function clearMergedGuestCartMarker() {
  try {
    sessionStorage.removeItem(MERGED_GUEST_CART_KEY);
  } catch {
    // Ignore storage access failures (private mode/restrictions).
  }
}

function dbRowsToCartItems(
  rows: Array<{
    product_id?: string | null;
    quantity?: number | null;
  }>,
): CartItems {
  const out: CartItems = {};
  for (const row of rows) {
    const productId = String(row.product_id ?? "").trim();
    const quantity = Number(row.quantity ?? 0);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    out[productId] = { quantity };
  }
  return out;
}

function applyDbCartToCookie(
  dbRows: Array<{
    product_id?: string | null;
    quantity?: number | null;
  }>,
) {
  const items = dbRowsToCartItems(dbRows);
  if (Object.keys(items).length > 0) {
    useCartStore.getState().replaceCart(items);
    return;
  }
  useCartStore.getState().replaceCart({});
  clearPersistedCartStorage();
  useCartStore.getState().replaceCart({});
}

/** Add guest cookie quantities onto existing DB rows, then mirror the result. */
async function mergeGuestCookieIntoDb(args: {
  supabase: SupabaseClient;
  userId: string;
  existingRows: Array<{
    product_id?: string | null;
    quantity?: number | null;
  }>;
}) {
  const cart = readClientCartCookie();
  if (!cart || typeof cart !== "object") return;

  const dbQtyByProduct = new Map<string, number>();
  for (const row of args.existingRows) {
    const productId = String(row.product_id ?? "").trim();
    const quantity = Number(row.quantity ?? 0);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    dbQtyByProduct.set(productId, quantity);
  }

  const upsertRows = Object.entries(cart)
    .map(([productId, productValue]) => {
      const guestQty = Number(productValue.quantity ?? 0);
      if (!Number.isFinite(guestQty) || guestQty <= 0) return null;
      const dbQty = dbQtyByProduct.get(productId) ?? 0;
      return {
        product_id: productId,
        user_id: args.userId,
        quantity: dbQty + guestQty,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (upsertRows.length === 0) return;

  await args.supabase.from("carts").upsert(upsertRows, {
    onConflict: "user_id,product_id",
  });

  const finalCart = dbRowsToCartItems(args.existingRows);
  for (const row of upsertRows) {
    finalCart[row.product_id] = { quantity: row.quantity };
  }

  clearPersistedCartStorage();
  useCartStore.getState().replaceCart(finalCart);
}

async function syncAuthCartOnAuthEvent(args: {
  supabase: SupabaseClient;
  userId: string;
  authEvent: string;
  sawLoggedOutInThisRuntime: boolean;
}) {
  const { data: dbRows, error: dbErr } = await args.supabase
    .from("carts")
    .select("product_id,quantity")
    .eq("user_id", args.userId);

  if (dbErr) {
    markGuestCartMergedForUser(args.userId);
    return;
  }

  const rows = dbRows ?? [];
  const action = decideGuestCartMerge({
    authEvent: args.authEvent,
    sawLoggedOutInThisRuntime: args.sawLoggedOutInThisRuntime,
    dbHasLines: rows.some((row) => Number(row.quantity ?? 0) > 0),
    cookieHasLines: cartHasLines(readClientCartCookie()),
    authCartCleared: hasAuthCartClearedForUser(args.userId),
  });

  markGuestCartMergedForUser(args.userId);

  try {
    if (action === "merge_cookie_to_db") {
      await mergeGuestCookieIntoDb({
        supabase: args.supabase,
        userId: args.userId,
        existingRows: rows,
      });
      return;
    }

    applyDbCartToCookie(rows);
  } catch {
    applyDbCartToCookie(rows);
  }
}

export const SupabaseAuthProvider: React.FC<SupabaseAuthProviderProps> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const removeAllCartStorage = useCartStore((s) => s.removeAllProducts);
  const setWishlist = useWishlistStore((s) => s.setWishlist);
  const clearWishlist = useWishlistStore((s) => s.clearWishlist);
  const { toast } = useToast();
  const router = useRouter();
  const lastWelcomedUserId = useRef<string | null>(null);
  const sawLoggedOutInThisRuntimeRef = useRef(false);

  const loadWishlistForUser = (userId: string) => {
    const supabase = createClient();
    supabase
      .from("wishlist")
      .select()
      .eq("user_id", userId)
      .then((data) => {
        const wishlistItems: Parameters<typeof setWishlist>[0] = {};

        data?.data?.forEach((item) => {
          wishlistItems[item.product_id] = {
            createdAt: new Date(item.created_at),
            updatedAt: new Date(item.created_at),
          };
        });

        setWishlist(wishlistItems);
      });
  };

  /** Merge device-local hearts into DB, then reload account wishlist. */
  const syncLocalWishlistToAccount = async (userId: string) => {
    const supabase = createClient();
    const localIds = Object.keys(useWishlistStore.getState().wishlist);
    if (localIds.length > 0) {
      const rows = localIds.map((productId) => ({
        user_id: userId,
        product_id: productId,
      }));
      const { error } = await supabase.from("wishlist").upsert(rows, {
        onConflict: "user_id,product_id",
        ignoreDuplicates: true,
      });
      if (error) {
        console.error("[wishlist] failed to sync local items:", error.message);
      }
    }
    loadWishlistForUser(userId);
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let cancelled = false;

    try {
      const supabase = createClient();

      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        if (data.session?.user) {
          setUser(data.session.user);
        }
      });

      const authChange = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);

        switch (_event) {
          case "INITIAL_SESSION":
            supabase.auth.getUser().then(async ({ data }) => {
              if (cancelled) return;
              setUser(data.user);
              if (!data.user?.id) {
                sawLoggedOutInThisRuntimeRef.current = true;
                return;
              }

              void syncLocalWishlistToAccount(data.user.id);
              await syncAuthCartOnAuthEvent({
                supabase,
                userId: data.user.id,
                authEvent: "INITIAL_SESSION",
                sawLoggedOutInThisRuntime: sawLoggedOutInThisRuntimeRef.current,
              });
            });
            break;
          case "PASSWORD_RECOVERY":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);
            });
            if (
              typeof window !== "undefined" &&
              !window.location.pathname.startsWith("/reset-password")
            ) {
              router.push("/reset-password");
            }
            break;

          case "SIGNED_IN":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);

              if (!data.user) {
                sawLoggedOutInThisRuntimeRef.current = true;
                return;
              }

              void syncAuthCartOnAuthEvent({
                supabase,
                userId: data.user.id,
                authEvent: "SIGNED_IN",
                sawLoggedOutInThisRuntime: sawLoggedOutInThisRuntimeRef.current,
              });
            });

            if (session?.user?.id) {
              void syncLocalWishlistToAccount(session.user.id);
            }

            if (
              session?.user?.id &&
              session.user.id !== lastWelcomedUserId.current &&
              !hasWelcomedInSession(session.user.id)
            ) {
              lastWelcomedUserId.current = session.user.id;
              markWelcomedInSession(session.user.id);
              toast({
                title: "Welcome back.",
                description: "You are already signed in.",
              });
            }
            break;
          case "SIGNED_OUT":
            setUser(null);
            lastWelcomedUserId.current = null;
            sawLoggedOutInThisRuntimeRef.current = true;
            clearWelcomedInSession();
            clearMergedGuestCartMarker();
            clearAuthCartClearedMarker();
            removeAllCartStorage();
            clearPersistedCartStorage();
            clearWishlist();
            break;

          case "TOKEN_REFRESHED":
          case "USER_UPDATED":
          case "MFA_CHALLENGE_VERIFIED":
            supabase.auth.getUser().then(({ data }) => {
              setUser(data.user);
            });
            break;
        }
      });

      subscription = authChange.data.subscription;
    } catch (error) {
      console.error("[auth] Failed to initialize client auth provider", error);
      setUser(null);
      setSession(null);
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [clearWishlist, removeAllCartStorage, router, setWishlist, toast]);

  return (
    <SupabaseAuthContext.Provider value={{ user, session }}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};
