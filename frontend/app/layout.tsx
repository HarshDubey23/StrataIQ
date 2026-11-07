import type { Metadata, Viewport } from "next";
import { Barlow_Semi_Condensed, Public_Sans } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });
const barlow = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-barlow", display: "swap" });

export const metadata: Metadata = {
  title: "StrataIQ: test a business location before you sign",
  description: "See the real competitors and neighborhood around any US location, and how many customers a day you need to break even.",
};

export const viewport: Viewport = { themeColor: "#1d4f91", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${publicSans.variable} ${barlow.variable}`}>
      <head>
        {/* runs before paint, so a returning visitor never sees the opening sheet */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(sessionStorage.getItem("siq-intro")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.seen="1"}catch(e){}` }} />
        {/* Entrance animations start hidden; without script the text must still show */}
        <noscript><style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}.curtain{display:none}.strip{clip-path:none!important}`}</style></noscript>
      </head>
      <body className="grain min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
