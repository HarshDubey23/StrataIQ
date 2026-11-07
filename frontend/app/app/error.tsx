"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

/** A screen that crashes must not take the whole app with it: the menu stays, and there is a way forward. */
export default function ScreenError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto w-full max-w-xl p-6 md:p-10">
      <h1 className="font-display text-[34px] leading-tight">This screen hit a problem.</h1>
      <p className="mt-3 text-[16px] text-ink-300">Your projects and numbers are safe. Try again, or go back to your projects.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <ButtonLink href="/app">My projects</ButtonLink>
      </div>
    </main>
  );
}
