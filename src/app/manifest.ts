import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Squared Away",
    short_name: "Squared Away",
    description: "Get your day squared away.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1F2B4D",
    theme_color: "#1F2B4D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
