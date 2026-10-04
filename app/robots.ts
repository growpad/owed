import type { MetadataRoute } from "next";

// The landing page is public; the app, sign-in and API are private.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api", "/login"] } };
}
