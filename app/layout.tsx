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

export const metadata: Metadata = {
  title: "Lattency · Nairobi WiFi Lines",
  description:
    "A crowdsourced metro map of café wifi speeds across Nairobi. Cafés are stations; lines are speed tiers.",
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
