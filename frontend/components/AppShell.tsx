"use client";

import { motion } from "motion/react";
import { BookOpen, LayoutGrid, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { AtlasKey, Logo } from "@/components/brand";
import { cn } from "@/components/ui";
import { api } from "@/lib/api";
import type { Capabilities, User } from "@/lib/types";

const Ctx = createContext<{ user: User | null; caps: Capabilities | null }>({ user: null, caps: null });
export const useSession = () => useContext(Ctx);

const nav = [
  { href: "/app", label: "My projects", icon: LayoutGrid, exact: true },
  { href: "/app/projects/new", label: "New analysis", icon: Plus },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<User>("/auth/me").then(setUser).catch(() => undefined);
    api<Capabilities>("/system/capabilities").then(setCaps).catch(() => undefined);
  }, []);
  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/sign-in");
    router.refresh();
  }

  const side = (
    <aside className="flex h-full w-56 flex-col bg-atlas text-white">
      <div className="flex h-16 items-center px-4">
        <Logo href="/app" tone="dark" />
      </div>
      <div className="px-4">
        <Link href="/app/projects/new" className="flex h-10 items-center justify-between border border-white px-3 text-sm font-semibold text-white transition-colors hover:bg-atlas-deep">
          New analysis <Plus className="h-4 w-4" />
        </Link>
      </div>
      <nav className="flex-1 pl-4 pt-5" aria-label="Main">
        {nav.filter((n) => n.href !== "/app/projects/new").map((n) => {
          const active = n.exact ? path === n.href : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2.5 text-[15px] transition-colors duration-200",
                active ? "font-medium text-night" : "text-white hover:bg-atlas-deep",
              )}
            >
              {active && <motion.span layoutId="nav-tab" className="absolute inset-0 bg-ink-950" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span className="relative flex-1">{n.label}</span>
              <n.icon className="relative h-4 w-4" />
            </Link>
          );
        })}
      </nav>
      <AtlasKey tone="dark" className="px-4 pb-5" />
      <div className="flex items-center justify-between gap-2 border-t border-white/25 px-4 py-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-white bg-atlas-deep text-[12px] font-semibold text-white">
            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-white" title={user?.email}>{user?.name || user?.email || " "}</span>
        </span>
        <button onClick={logout} className="p-1.5 text-white hover:bg-atlas-deep" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );

  return (
    <Ctx.Provider value={{ user, caps }}>
      <div className="flex min-h-screen">
        <div className="no-print sticky top-0 hidden h-screen md:block">{side}</div>
        {open && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="h-full">{side}</div>
            <button className="flex-1 bg-night/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="no-print flex h-14 items-center gap-3 bg-atlas px-4 text-white md:hidden">
            <button onClick={() => setOpen((x) => !x)} aria-label="Menu" className="text-white">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Logo href="/app" tone="dark" />
          </div>
          {children}
        </div>
      </div>
    </Ctx.Provider>
  );
}
