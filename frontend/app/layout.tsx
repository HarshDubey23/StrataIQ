import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter_Tight, JetBrains_Mono, Tiro_Devanagari_Hindi } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import VoiceDock from "@/components/voice/VoiceDockLoader";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });
// Archivo with its width axis: extra-wide for landing headlines, normal width for landing text
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const tiro = Tiro_Devanagari_Hindi({ subsets: ["devanagari"], weight: "400", variable: "--font-tiro", display: "swap" });

export const metadata: Metadata = {
  title: "StrataIQ: test a business location before you sign",
  description: "See the real competitors and neighbourhood around any US location, and how many customers a day you need to break even.",
};

export const viewport: Viewport = { themeColor: "#f3f4f1", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable} ${tiro.variable} ${archivo.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@400,500&display=swap" rel="stylesheet" />
      </head>
      <body className="grain min-h-screen font-sans">
        {children}
        {process.env.NEXT_PUBLIC_VOICE === "1" && <VoiceDock />}
      </body>
    </html>
  );
}
