import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (SIL OFL, licenses in app/fonts) so builds never depend on a font download.
const display = localFont({ src: "./fonts/bricolage-grotesque.woff2", weight: "600 800", variable: "--font-display" });
const body = localFont({ src: "./fonts/public-sans.woff2", weight: "400 700", variable: "--font-body" });

const description = "The assistant you CC. It remembers what people owe you, and gets it back.";

export const metadata: Metadata = {
  // Absolute URLs for the preview image: Vercel sets the production host; locally it is localhost.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000",
  ),
  title: { default: "Owed", template: "%s | Owed" },
  description,
  applicationName: "Owed",
  openGraph: { title: "Owed", description, siteName: "Owed", type: "website" },
  twitter: { card: "summary_large_image", title: "Owed", description },
};

export const viewport: Viewport = { themeColor: "#1a2230" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
