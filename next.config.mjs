/** @type {import('next').NextConfig} */

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://sdk.cashfree.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com https://ssr-tex-media-proxy.ssr-tex-shop.workers.dev",
  "frame-src 'self' https://js.stripe.com https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://sdk.cashfree.com https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com https://www.cashfree.com",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
  images: {
    // Serve R2/CDN URLs as-is — uploads are already compressed client-side.
    // Disables Vercel Image Optimization (/_next/image) billing & CPU.
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 320, 384, 400],
    remotePatterns: [
      // Demo images (HiyoRi default S3)
      {
        protocol: "https",
        hostname: "hiyori-backpack.s3.us-west-2.amazonaws.com",
      },
      // Your S3 bucket when configured in .env.local
      ...(process.env.NEXT_PUBLIC_S3_BUCKET &&
      process.env.NEXT_PUBLIC_S3_BUCKET !== "placeholder"
        ? [
            {
              protocol: "https",
              hostname: `${process.env.NEXT_PUBLIC_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_S3_REGION || "ap-south-1"}.amazonaws.com`,
            },
          ]
        : []),
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [
            {
              protocol: "https",
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      ...(process.env.NEXT_PUBLIC_CDN_URL
        ? [
            {
              protocol: "https",
              hostname: new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname,
            },
          ]
        : []),
      // Shop saree model photography (shared public storage)
      {
        protocol: "https",
        hostname: "qhtwwyqlsnckorndmhmt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "source.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "vumbnail.com",
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["@aws-sdk/client-s3", "sharp"],
    // Always refetch dynamic routes (e.g. admin dashboard) when navigating
    // back to them, instead of replaying the stale client Router Cache.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns"],
  },
}

export default nextConfig
