import Link from "next/link";

export const metadata = { title: "Privacy | StrataIQ" };

export default function Page() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-[62ch] bg-paper px-5 py-12 text-night">
      <Link href="/" className="font-display text-2xl font-medium">StrataIQ</Link>
      <h1 className="mt-10 font-display text-5xl font-normal tracking-[-0.03em]">Privacy</h1>
      <section className="mt-9"><h2 className="text-[20px] font-medium">What we collect</h2><p className="mt-2 text-[17px] leading-[1.5]">Your email address, name and encrypted password if you register; the projects, places and business figures you enter; and technical logs such as IP addresses, used for security and rate limits.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">How we use it</h2><p className="mt-2 text-[17px] leading-[1.5]">To run the service and keep it secure. We do not sell your data. Your business figures are private to your account unless you create a share link.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Who processes it</h2><p className="mt-2 text-[17px] leading-[1.5]">We use hosting, database and error-monitoring providers. Place searches are sent to mapping services such as OpenStreetMap. If you use AI features, the relevant project facts are sent to an AI provider.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Simulated people</h2><p className="mt-2 text-[17px] leading-[1.5]">The people in simulations are synthetic. They are generated from neighbourhood statistics and do not represent real individuals.</p></section>
      <section className="mt-9"><h2 className="text-[20px] font-medium">Your choices</h2><p className="mt-2 text-[17px] leading-[1.5]">You can ask us to delete your account and its data at any time. Guest workspaces may be deleted after a period of inactivity.</p></section>
      {contact && <p className="mt-9 text-[17px]">Questions: <a className="underline underline-offset-4" href={`mailto:${contact}`}>{contact}</a></p>}
      <p className="mt-9 text-[16px]">Last updated 7 November 2026.</p>
    </main>
  );
}
