import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM; keep it out of the server bundle (fake mode only).
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: { "/api/**": ["./schema.sql"] },
};

export default nextConfig;
