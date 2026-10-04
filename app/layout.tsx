import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (SIL OFL, licenses in app/fonts) so builds never depend on a font download.
const display = localFont({ src: "./fonts/bricolage-grotesque.woff2", weight: "600 800", variable: "--font-display" });
const body = localFont({ src: "./fonts/public-sans.woff2", weight: "400 700", variable: "--font-body" });

export const metadata: Metadata = {
  title: "Owed",
  description: "The assistant you CC. It remembers what people owe you, and gets it back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
