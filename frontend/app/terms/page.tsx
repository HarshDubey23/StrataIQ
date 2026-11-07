import Link from "next/link";

export const metadata = { title: "Terms of use | StrataIQ" };

export default function Page() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-[62ch] bg-paper px-5 py-12 text-night">
      <Link href="/" className="font-display text-2xl font-medium">StrataIQ</Link>
      <h1 className="mt-10 font-display text-5xl font-normal tracking-[-0.03em]">Terms of use</h1>
      <section className="mt-9"><h2 className="text-[20px] font-medium">What StrataIQ is</h2><p className="mt-2 text-[17px] leading-[1.5]">StrataIQ is a planning tool that estimates how a business might perform at a location. Its results are model estimates based on public data and assumptions.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">No guarantee or advice</h2><p className="mt-2 text-[17px] leading-[1.5]">We do not promise any result. Nothing here is financial, legal, tax or real-estate advice. You are responsible for your decisions, so verify the figures and get professional advice before you sign a lease or borrow money.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Your account</h2><p className="mt-2 text-[17px] leading-[1.5]">Keep your sign-in details safe and use the service lawfully. Do not attack, overload or scrape it. We may suspend accounts that do.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Data sources</h2><p className="mt-2 text-[17px] leading-[1.5]">Public data can be incomplete or out of date, including competitor lists. Results are only as good as the data and the numbers you enter.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Liability</h2><p className="mt-2 text-[17px] leading-[1.5]">To the extent the law allows, our total liability for any claim is limited to the amount you paid us for the report concerned.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Changes</h2><p className="mt-2 text-[17px] leading-[1.5]">We may update these terms. The date below shows the current version.</p></section>
      {contact && <p className="mt-9 text-[17px]">Questions: <a className="underline underline-offset-4" href={`mailto:${contact}`}>{contact}</a></p>}
      <p className="mt-9 text-[16px]">Last updated 7 November 2026.</p>
    </main>
  );
}
