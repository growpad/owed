import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owed",
  description: "The agent that remembers what people owe you, and gets it back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
