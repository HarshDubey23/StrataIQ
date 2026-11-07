"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/brand";
import { Button, ErrorState, Field, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Project, User } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
  name: z.string().max(120).optional(),
});

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = params.get("demo") === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password, name: name || undefined });
    if (!parsed.success) {
      const f: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (f[String(i.path[0])] = i.message));
      setErrors(f);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api<User>(mode === "sign-up" ? "/auth/signup" : "/auth/login", { method: "POST", json: parsed.data });
      if (demo) {
        const p = await api<Project>("/demo", { method: "POST" });
        router.push(`/app/projects/${p.id}/live`);
        return;
      }
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : mode === "sign-up" ? "/onboarding" : "/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      if (err instanceof ApiError && err.fields.length) {
        const f: Record<string, string> = {};
        err.fields.forEach((x) => (f[x.field] = x.message));
        setErrors(f);
      }
    } finally {
      setBusy(false);
    }
  }

  async function guest() {
    setBusy(true);
    setError(null);
    try {
      await api<User>("/auth/guest", { method: "POST" });
      if (demo) {
        const p = await api<Project>("/demo", { method: "POST" });
        router.push(`/app/projects/${p.id}/live`);
        return;
      }
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : "/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Logo />
        </div>
        <form onSubmit={submit} className="space-y-5 bg-white p-8 text-ink-100" noValidate>
          <div>
            <h1 className="font-display text-4xl font-medium leading-none tracking-[-0.03em]">{mode === "sign-up" ? "Create your account" : "Sign in"}</h1>
            <p className="mt-1 text-sm text-ink-300">
              {demo ? "Sign in to open the labeled demo scenario." : mode === "sign-up" ? "Start testing business ideas against a model of the real market." : "Welcome back."}
            </p>
          </div>
          {error && <ErrorState message={error} />}
          {mode === "sign-up" && (
            <Field label="Name (optional)" htmlFor="name" error={errors.name}>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
          )}
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint={mode === "sign-up" ? "At least 8 characters. Stored only as a salted bcrypt hash." : undefined}>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={guest}
            className="w-full rounded-md border border-ink-100/15 py-2.5 text-sm font-semibold text-ink-200 transition-colors hover:border-ink-100 hover:bg-ink-100 hover:text-white"
          >
            Continue as guest
          </button>
          <p className="text-center text-xs text-ink-400">
            {mode === "sign-up" ? (
              <>Already have an account? <Link className="text-accent hover:underline" href={`/sign-in${demo ? "?demo=1" : ""}`}>Sign in</Link></>
            ) : (
              <>New here? <Link className="text-accent hover:underline" href={`/sign-up${demo ? "?demo=1" : ""}`}>Create an account</Link></>
            )}
          </p>
          {mode === "sign-in" && (
            <p className="text-center text-[11px] text-ink-500">Forgot your password? Contact support and we will help you get back in.</p>
          )}
        </form>
      </div>
    </div>
  );
}
