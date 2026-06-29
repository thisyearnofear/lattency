import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "Check your email · Lattency",
};

export default function VerifyPage() {
  return (
    <>
      <TopNav current="app" />
      <main className="mx-auto max-w-[640px] px-6 md:px-12 pt-12 pb-24 text-center">
        <p className="stamp">Magic link sent</p>
        <h1
          className="font-display font-black uppercase text-ink leading-[0.92] tracking-[-0.02em] mt-3"
          style={{ fontSize: "clamp(40px, 7vw, 80px)" }}
        >
          Check your inbox.
        </h1>
        <p className="font-serif italic text-ink-soft text-xl mt-5">
          We just sent a sign-in link to the address you gave us. Open it
          on any device — clicking the link will sign you in here and the
          tab will refresh.
        </p>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint mt-8 leading-relaxed">
          The link is single-use and expires in 24 hours.
          <br />
          Nothing in your inbox after a minute?{" "}
          <Link
            href="/auth/signin"
            className="text-ink-soft hover:text-ink underline underline-offset-4"
          >
            Try again →
          </Link>
        </p>
      </main>
    </>
  );
}
