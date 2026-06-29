import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  weight: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const serif = Fraunces({
  variable: "--font-fraunces",
  weight: ["400", "500"],
  style: ["italic", "normal"],
  subsets: ["latin"],
  display: "swap",
});

const description =
  "A crowdsourced metro map of café wifi speeds across Nairobi. Cafés become stations; speed tiers become transit lines. Anyone with a connection can map the network.";

export const metadata: Metadata = {
  metadataBase: new URL("https://lattency.vercel.app"),
  title: {
    default: "Lattency · Nairobi WiFi Lines",
    template: "%s · Lattency",
  },
  description,
  applicationName: "Lattency",
  authors: [{ name: "Lattency" }],
  creator: "Lattency",
  keywords: [
    "Nairobi",
    "wifi",
    "internet speed",
    "cafés",
    "metro map",
    "latency",
    "crowdsourced",
    "transit map",
    "Kenya",
    "speed test",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Lattency",
    title: "Lattency · Nairobi WiFi Lines",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Lattency · Nairobi WiFi Lines",
    description,
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-cream text-ink paper-grain">{children}</body>
    </html>
  );
}
