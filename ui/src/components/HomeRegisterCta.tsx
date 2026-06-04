"use client";

/**
 * Homepage hero CTA cluster. "Register with EUDI Wallet" opens the RegisterDialog
 * (QR + interactive wallet approval); on approval the demo signs the visitor in
 * as the demo patient and forwards them to their personal health record.
 * The other two links (journey explainer, returning-user sign-in) are unchanged.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanLine, ArrowRight, Info } from "lucide-react";
import { RegisterDialog } from "@/components/RegisterDialog";
import { setDemoPersona } from "@/lib/use-demo-persona";

export function HomeRegisterCta() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onComplete = () => {
    // Demo only: a completed wallet registration signs the visitor in as the
    // demo patient (sessionStorage drives the nav, localStorage drives the
    // restricted /api/patient mock — see lib/api.ts).
    setDemoPersona("patient1");
    try {
      localStorage.setItem("demo-persona", "patient1");
    } catch {
      /* storage unavailable — non-fatal for the visual demo */
    }
    setOpen(false);
    router.push("/patient");
  };

  return (
    <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-white font-semibold text-base shadow-md transition-all hover:scale-[1.02]"
        style={{ background: "linear-gradient(135deg,#7D3C98,#2471A3)" }}
      >
        <ScanLine size={20} aria-hidden="true" />
        Register with EUDI Wallet
        <ArrowRight
          size={18}
          aria-hidden="true"
          className="group-hover:translate-x-1 transition-transform"
        />
      </button>
      <Link
        href="/journey"
        title="Passwordless & sovereign — no email or password. You approve on your phone and share only the exact claims requested. Tap to see the full patient journey."
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
      >
        <Info size={15} aria-hidden="true" />
        Why we need EUDI Wallet for the patient journey
      </Link>
      <Link
        href="/auth/eudi-qr?mode=login"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
      >
        Already have it? Sign in <ArrowRight size={14} aria-hidden="true" />
      </Link>

      {open && (
        <RegisterDialog
          mode="register"
          title="Register in the European Health Dataspace"
          subtitle="Create your EHDS patient account with your EUDI Wallet — you share only the exact identity claims requested (name, date of birth)."
          onClose={() => setOpen(false)}
          onComplete={onComplete}
        />
      )}
    </div>
  );
}
