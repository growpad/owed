import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Owed",
    short_name: "Owed",
    description: "The assistant you CC. It remembers what people owe you, and gets it back.",
    start_url: "/app",
    display: "standalone",
    background_color: "#e8ecef",
    theme_color: "#1a2230",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
