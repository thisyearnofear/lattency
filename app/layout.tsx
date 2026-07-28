import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { NimiqProvider } from "@/components/nimiq-provider";

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
  "A crowdsourced metro map of café wifi speeds. Cafés become stations; speed tiers become transit lines. Anyone with a connection can map the network — live in London, Nairobi & San Francisco.";

export const metadata: Metadata = {
  metadataBase: new URL("https://lattency.vercel.app"),
  title: {
    default: "Lattency · café wifi, mapped like transit",
    template: "%s · Lattency",
  },
  description,
  applicationName: "Lattency",
  authors: [{ name: "Lattency" }],
  creator: "Lattency",
  keywords: [
    "wifi",
    "internet speed",
    "cafés",
    "coworking",
    "metro map",
    "latency",
    "crowdsourced",
    "transit map",
    "speed test",
    "London",
    "Nairobi",
    "San Francisco",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Lattency",
    title: "Lattency · café wifi, mapped like transit",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Lattency · café wifi, mapped like transit",
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
      <body className="min-h-full bg-cream text-ink paper-grain">
        <NimiqProvider>{children}</NimiqProvider>
      </body>
    </html>
  );
}
