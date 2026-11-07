import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter_Tight } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
// Archivo with its width axis: extra-wide for landing headlines, normal width for landing text
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: "StrataIQ: test a business location before you sign",
  description: "See the real competitors and neighborhood around any US location, and how many customers a day you need to break even.",
};

export const viewport: Viewport = { themeColor: "#f3f4f1", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${archivo.variable}`}>
      <head>
        {/* Entrance animations start hidden; without script the text must still show */}
        <noscript><style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style></noscript>
      </head>
      <body className="grain min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
