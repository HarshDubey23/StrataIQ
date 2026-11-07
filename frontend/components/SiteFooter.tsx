import { RollLink } from "@/components/motion";

export function SiteFooter() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="max-w-[62ch] py-8 text-[14px] leading-[1.5]">
      <nav className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[16px]">
        <RollLink href="/methodology">How it works</RollLink>
        <RollLink href="/sample-report">Sample report</RollLink>
        <RollLink href="/terms">Terms</RollLink>
        <RollLink href="/privacy">Privacy</RollLink>
        <RollLink href="/refunds">Refunds</RollLink>
      </nav>
      <p className="mb-2 text-[16px]">© 2026 StrataIQ{email && <> · <a className="underline underline-offset-4" href={`mailto:${email}`}>Support</a></>}</p>
      Map data © OpenStreetMap contributors (ODbL). Population © WorldPop (CC BY 4.0). Income and neighborhood figures: U.S. Census Bureau, not endorsed or certified by the Census Bureau. Tiles © OpenFreeMap / OpenMapTiles. Forecasts are estimates, not guarantees or financial advice.
    </footer>
  );
}
