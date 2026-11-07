import Link from "next/link";

export const metadata = { title: "Refunds | StrataIQ" };

export default function Page() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-[62ch] bg-paper px-5 py-12 text-night">
      <Link href="/" className="font-display text-2xl font-medium">StrataIQ</Link>
      <h1 className="mt-10 font-display text-5xl font-normal tracking-[-0.03em]">Refunds</h1>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Full reports</h2><p className="mt-2 text-[17px] leading-[1.5]">A full report is a one-time payment for one location. If it fails to generate or contains a technical fault, tell us within 14 days and we will fix it or refund you.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Your legal rights</h2><p className="mt-2 text-[17px] leading-[1.5]">This policy does not limit any refund rights you have under the law where you live.</p></section>
      {contact && <p className="mt-9 text-[17px]">Questions: <a className="underline underline-offset-4" href={`mailto:${contact}`}>{contact}</a></p>}
      <p className="mt-9 text-[16px]">Last updated 7 November 2026.</p>
    </main>
  );
}
