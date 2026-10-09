/**
 * SSR Tex shop hostname on Cloudflare → Netlify origin.
 *
 * Edge cache:
 * - Cache public catalog HTML + public storefront APIs (short TTL)
 * - Never cache cart / checkout / auth / account / admin / webhooks
 * - Bypass when Supabase auth cookies or Authorization are present
 * - Never store responses that Set-Cookie
 *
 * X-SSR-Cache: HIT | MISS | BYPASS
 */
const ORIGIN = "https://ssrtex.netlify.app";
const APEX = "sairaghavendratex.com";
const WWW = "www.sairaghavendratex.com";

/** Fallback TTL when origin omits s-maxage (seconds). */
const DEFAULT_HTML_S_MAXAGE = 120;
/** Rarely changing info pages (payment, shipping, policies). */
const DEFAULT_STATIC_HTML_S_MAXAGE = 600;
const DEFAULT_API_S_MAXAGE = 120;
/** Hard ceiling for catalog HTML / APIs. */
const MAX_S_MAXAGE = 300;
/** Hard ceiling for static info HTML only. */
const MAX_STATIC_HTML_S_MAXAGE = 900;

const SIZE_CONFIG_PATH = "/api/products/size-config";

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cdn-loop",
]);

/** Paths that must never be served from shared edge cache. */
const PRIVATE_PREFIXES = [
  "/cart",
  "/orders",
  "/wish-list",
  "/setting",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/admin",
  "/api/",
] as const;

const STATIC_INFO_PATHS = new Set([
  "/about",
  "/contact",
  "/faq",
  "/shipping-returns",
  "/privacy-policy",
  "/payment-methods",
  "/store-policy",
  "/terms-and-conditions",
  "/terms-of-use",
]);

const PUBLIC_APIS = new Set([
  SIZE_CONFIG_PATH,
  "/api/storefront/products",
  "/api/geo/pincode",
]);

function copyHeaders(source: Headers, extra?: Record<string, string>): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return headers;
}

function rewriteLocation(value: string): string {
  try {
    const url = new URL(value, `https://${WWW}`);
    if (
      url.hostname === APEX ||
      url.hostname.endsWith(".netlify.app") ||
      url.hostname.endsWith(".vercel.app")
    ) {
      url.protocol = "https:";
      url.hostname = WWW;
      url.port = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/.test(cookieHeader);
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_APIS.has(pathname.toLowerCase());
}

function isPrivatePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (isPublicApi(path)) return false;
  return PRIVATE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

function isStaticInfoHtmlPath(pathname: string): boolean {
  return STATIC_INFO_PATHS.has(pathname.toLowerCase());
}

function isPublicHtmlPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path === "/" || path === "") return true;
  if (path === "/shop" || path.startsWith("/shop/")) return true;
  if (path === "/collections" || path.startsWith("/collections/")) return true;
  if (path === "/featured") return true;
  return isStaticInfoHtmlPath(path);
}

function isCacheableGet(request: Request, url: URL): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.has("authorization")) return false;
  if (hasSupabaseAuthCookie(request.headers.get("cookie"))) return false;
  if (isPrivatePath(url.pathname)) return false;
  return isPublicHtmlPath(url.pathname) || isPublicApi(url.pathname);
}

/** Stable cache key: www host; RSC flight requests kept apart from HTML. */
function normalizeCacheKeyUrl(request: Request, requestUrl: URL): URL {
  const cacheUrl = new URL(requestUrl.toString());
  cacheUrl.hostname = WWW;
  cacheUrl.protocol = "https:";
  cacheUrl.hash = "";
  cacheUrl.port = "";

  if (cacheUrl.pathname === SIZE_CONFIG_PATH) {
    const productIdsParam = cacheUrl.searchParams.get("productIds");
    if (productIdsParam) {
      const ids = [
        ...new Set(
          productIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ].sort();
      cacheUrl.search = "";
      if (ids.length > 0) {
        cacheUrl.searchParams.set("productIds", ids.join(","));
      }
    }
  }

  // Next.js serves HTML and RSC payloads from the same URL, split by headers.
  const rsc = request.headers.get("rsc");
  if (rsc) {
    cacheUrl.searchParams.set("__edge_rsc", rsc);
    const prefetch = request.headers.get("next-router-prefetch");
    if (prefetch) cacheUrl.searchParams.set("__edge_prefetch", prefetch);
    const tree = request.headers.get("next-router-state-tree");
    if (tree) cacheUrl.searchParams.set("__edge_tree", tree);
  }

  return cacheUrl;
}

function parseSMaxAge(
  cacheControl: string | null,
  fallback: number,
  ceiling: number,
): number {
  if (!cacheControl) return fallback;
  const lower = cacheControl.toLowerCase();
  if (lower.includes("no-store") || lower.includes("private")) return 0;
  const match = lower.match(/(?:^|,)\s*s-maxage=(\d+)/);
  if (match) return Math.min(Number(match[1]), ceiling);
  const maxAge = lower.match(/(?:^|,)\s*max-age=(\d+)/);
  if (maxAge && Number(maxAge[1]) > 0) {
    return Math.min(Number(maxAge[1]), ceiling);
  }
  return fallback;
}

/**
 * Edge TTL for anonymous public responses.
 * Next.js often sends `private, no-store` or `max-age=0` on HTML even for
 * public catalog pages — safe to edge-cache after the auth/cookie gates above.
 */
function resolveEdgeTtl(pathname: string, cacheControl: string | null): number {
  if (isPublicApi(pathname)) {
    return parseSMaxAge(cacheControl, DEFAULT_API_S_MAXAGE, MAX_S_MAXAGE);
  }
  if (isStaticInfoHtmlPath(pathname)) {
    const parsed = parseSMaxAge(
      cacheControl,
      DEFAULT_STATIC_HTML_S_MAXAGE,
      MAX_STATIC_HTML_S_MAXAGE,
    );
    return Math.max(parsed, DEFAULT_STATIC_HTML_S_MAXAGE);
  }
  if (isPublicHtmlPath(pathname)) {
    const parsed = parseSMaxAge(
      cacheControl,
      DEFAULT_HTML_S_MAXAGE,
      MAX_S_MAXAGE,
    );
    return parsed > 0 ? parsed : DEFAULT_HTML_S_MAXAGE;
  }
  return 0;
}

function withCacheHeader(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-SSR-Cache", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchOrigin(request: Request, incoming: URL): Promise<Response> {
  const outbound = new URL(incoming.pathname + incoming.search, ORIGIN);
  const headers = copyHeaders(request.headers, {
    "X-Forwarded-Host": WWW,
    "X-Forwarded-Proto": "https",
  });
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);
  headers.delete("accept-encoding");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(outbound.toString(), init);
  const outHeaders = copyHeaders(upstream.headers);
  const location = outHeaders.get("location");
  if (location) {
    outHeaders.set("location", rewriteLocation(location));
  }
  if (
    (outHeaders.get("x-robots-tag") || "").toLowerCase().includes("noindex")
  ) {
    outHeaders.delete("x-robots-tag");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };

async function handleCachedGet(
  request: Request,
  incoming: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    normalizeCacheKeyUrl(request, incoming).toString(),
    { method: "GET" },
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    return withCacheHeader(cached, "HIT");
  }

  const upstream = await fetchOrigin(request, incoming);
  const sMaxAge = resolveEdgeTtl(
    incoming.pathname,
    upstream.headers.get("cache-control"),
  );

  // Never share personalized or uncacheable responses.
  if (
    upstream.status !== 200 ||
    sMaxAge <= 0 ||
    upstream.headers.has("set-cookie")
  ) {
    return withCacheHeader(upstream, "BYPASS");
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > 1_500_000) {
    return withCacheHeader(
      new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      }),
      "BYPASS",
    );
  }

  const storeHeaders = new Headers(upstream.headers);
  storeHeaders.delete("set-cookie");
  storeHeaders.set(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
  );
  storeHeaders.set("X-SSR-Cache", "MISS");

  const toStore = new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: storeHeaders,
  });

  ctx.waitUntil(cache.put(cacheKey, toStore.clone()));

  // Browsers revalidate HTML each visit; only the edge holds the copy.
  const clientHeaders = new Headers(storeHeaders);
  clientHeaders.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(toStore.body, {
    status: toStore.status,
    statusText: toStore.statusText,
    headers: clientHeaders,
  });
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (incoming.protocol === "http:" || host === APEX) {
      incoming.protocol = "https:";
      incoming.hostname = WWW;
      // 307: a cached permanent redirect would pin visitors if hosting changes.
      return Response.redirect(incoming.toString(), 307);
    }

    if (isCacheableGet(request, incoming)) {
      return handleCachedGet(request, incoming, ctx);
    }

    const upstream = await fetchOrigin(request, incoming);
    return withCacheHeader(upstream, "BYPASS");
  },
};
