"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportView, type ReportContent } from "@/components/ReportView";
import { ErrorState, Skeleton } from "@/components/ui";

export default function SampleReport() {
  const [c, setC] = useState<ReportContent | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/v1/shared/reports/sample-report-downtown-austin").then((r) => (r.ok ? r.json() : Promise.reject())).then((r) => setC(r.content)).catch(() => setFailed(true));
  }, []);
  return (
    <div className="min-h-screen bg-paper px-4 py-8 text-night">
      <div className="no-print mx-auto mb-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="font-display text-2xl font-medium">StrataIQ</Link>
          <button onClick={() => window.print()} className="min-h-11 bg-accent px-5 text-[16px] font-medium text-white">Download PDF</button>
        </div>
        <p className="mt-3 bg-night p-4 text-[17px] leading-snug text-white">
          This is a sample report. The market data is real and was loaded live for Downtown Austin; the prices and costs are example inputs, not a real business.{" "}
          <Link href="/" className="whitespace-nowrap font-medium underline underline-offset-4">Test your own location</Link>
        </p>
      </div>
      {failed && <div className="mx-auto max-w-4xl"><ErrorState message="The sample report could not be loaded." /></div>}
      {!c && !failed && <Skeleton className="mx-auto h-96 max-w-4xl" />}
      {c && <ReportView c={c} />}
    </div>
  );
}
