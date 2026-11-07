import { AppShell } from "@/components/AppShell";
import VoiceDock from "@/components/voice/VoiceDockLoader";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      {process.env.NEXT_PUBLIC_VOICE === "1" && <VoiceDock />}
    </>
  );
}
