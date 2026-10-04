import type { NextConfig } from "next";

// Standard hardening for a signed-in app. HSTS comes from Vercel. A full script CSP is left out:
// Next's inline bootstrap needs nonces for that; frame-ancestors covers clickjacking.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The preview image reads its fonts from disk at runtime; ship them with that route.
  outputFileTracingIncludes: { "/opengraph-image": ["./app/fonts/*.ttf"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
