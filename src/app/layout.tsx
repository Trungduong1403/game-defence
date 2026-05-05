import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE LAST BORDER: BREAKING DAWN",
  description: "Tower defence game – defend the border, climb the leaderboard!",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Last Border",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    