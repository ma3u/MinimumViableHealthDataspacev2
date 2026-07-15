"use client";

/**
 * EHDS Patient Wallet — Maria's journey (presentation mode).
 *
 * A self-contained, full-screen, click-through story for a ~1-minute demo.
 * Works on the static GitHub Pages export (no API calls). Four steps from the
 * EHDS_Patient_Wallet.drawio: register → fetch EHR → donate → results.
 *
 * Presentation criteria: always-visible prev/next, mobile + desktop, step-by-step
 * fade-in (headline first, then blocks), fonts fit the viewport, strong contrast.
 * Synthetic data · fictional orgs only.
 */

import { useCallback, useEffect, useState } from "react";
import { WalletFlow } from "@/components/wallet/PhoneFrame";
import { REGISTER_STEPS, LOGIN_STEPS } from "@/components/wallet/flows";
import { EhrTransferSim } from "@/components/wallet/EhrTransferSim";
import {
  insurer,
  donationSources,
  type DataSource,
} from "@/lib/journey-config";
import {
  type LucideIcon,
  ScanLine,
  HandHeart,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  FlaskConical,
  Activity,
  Wind,
  Salad,
  Database,
} from "lucide-react";

/** Per-step accent (matches the 5-layer graph palette). */
const ACCENTS = ["#2471A3", "#148F77", "#1E8449", "#7D3C98"];

/**
 * The static GitHub Pages export is served under a basePath; client-rendered
 * asset URLs must include it (next/image does not reliably prepend it here, so
 * we use plain <img> with an explicit prefix — same pattern as src/lib/api.ts).
 */
const BASE_PATH =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
    ? "/MinimumViableHealthDataspacev2"
    : "";

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={`jrny-reveal ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[clamp(1.05rem,2.2vw,1.6rem)] italic text-[var(--text-primary)] leading-snug">
      &ldquo;{children}&rdquo;
    </p>
  );
}

/** ── Slide 0 — title ─────────────────────────────────────────────────────── */
function SlideIntro() {
  const steps = [
    { n: 1, t: "Register", c: ACCENTS[0] },
    { n: 2, t: "Get my EHR", c: ACCENTS[1] },
    { n: 3, t: "Donate to research", c: ACCENTS[2] },
    { n: 4, t: "See my results", c: ACCENTS[3] },
  ];
  return (
    <div className="text-center max-w-3xl mx-auto">
      <Reveal>
        <p className="uppercase tracking-[0.18em] text-sm font-semibold text-[var(--accent)] mb-3">
          EHDS Patient Wallet
        </p>
      </Reveal>
      <Reveal delay={120}>
        <h1 className="font-extrabold text-[clamp(1.9rem,5.5vw,3.4rem)] leading-[1.05] text-[var(--text-primary)] mb-4">
          Maria takes control of
          <br />
          her health data
        </h1>
      </Reveal>
      <Reveal delay={260}>
        <p className="text-[clamp(1rem,2.3vw,1.4rem)] text-[var(--text-secondary)] mb-9">
          From digital identity to personal research insights — in four steps.
        </p>
      </Reveal>
      <Reveal delay={400}>
        <div className="flex flex-wrap justify-center gap-3">
          {steps.map((s) => (
            <span
              key={s.n}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium bg-[var(--surface-2)]"
              style={{ borderColor: s.c, color: s.c }}
            >
              <span
                className="grid place-items-center w-5 h-5 rounded-full text-white text-[11px] font-bold"
                style={{ background: s.c }}
              >
                {s.n}
              </span>
              {s.t}
            </span>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

/** ── Slide 1 — register via QR + EUDI Wallet ─────────────────────────────── */
function SlideRegister() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const isReg = mode === "register";
  return (
    <div className="max-w-5xl mx-auto w-full">
      <Reveal>
        <h2 className="font-extrabold text-[clamp(1.4rem,3.2vw,2.1rem)] leading-tight text-[var(--text-primary)] mb-1 text-center">
          {isReg ? "Register" : "Sign in"} with your EUDI Wallet — no password
        </h2>
      </Reveal>
      <Reveal delay={120} className="flex flex-col items-center gap-3 mb-4">
        <p className="text-center text-sm text-[var(--text-secondary)]">
          {isReg
            ? "First time: scan → approve → registered."
            : "Returning: scan → approve → back in. The wallet skips the trust step."}{" "}
          · OpenID4VP · eIDAS 2.0
        </p>
        <div className="inline-flex rounded-full border border-[var(--border)] p-1 bg-[var(--surface-2)]">
          {(
            [
              ["register", "First time · Register"],
              ["login", "Returning · Login"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                mode === m ? "text-white" : "text-[var(--text-secondary)]"
              }`}
              style={mode === m ? { background: ACCENTS[0] } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </Reveal>
      <div className="grid md:grid-cols-2 gap-8 items-center justify-items-center">
        <Reveal delay={200} className="flex flex-col items-center">
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE_PATH}/journey/qr-register.png`}
              alt="QR code to register with your EUDI Wallet"
              width={230}
              height={230}
              className="block w-[clamp(150px,24vw,230px)] h-auto"
            />
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <ScanLine size={18} style={{ color: ACCENTS[0] }} />
            Scan with your EUDI Wallet
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Live flow → ehds.mabu.red/auth/eudi-qr
            {isReg ? "" : "?mode=login"}
          </p>
        </Reveal>
        <Reveal delay={340} key={mode} className="flex justify-center">
          <WalletFlow
            loop
            ariaLabel={`Simulated EUDI Wallet ${mode}`}
            steps={isReg ? REGISTER_STEPS : LOGIN_STEPS}
          />
        </Reveal>
      </div>
    </div>
  );
}

/** ── Slide 2 — fetch EHR from health insurance ───────────────────────────── */
function SlideEhr() {
  const [transferred, setTransferred] = useState(false);
  return (
    <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto w-full">
      <Reveal
        delay={140}
        key={transferred ? "shot" : "sim"}
        className="order-2 md:order-1 flex justify-center w-full"
      >
        {transferred ? (
          <div className="w-full">
            <div className="rounded-xl overflow-hidden border border-[var(--border)] shadow-lg bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE_PATH}/journey/app-profile.png`}
                alt="Maria's electronic health record now in the portal, with cardiovascular and diabetes risk scores"
                width={1280}
                height={860}
                className="block w-full h-auto"
              />
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-2 text-center">
              Now in the portal as FHIR R4 — synthetic data
            </p>
          </div>
        ) : (
          <EhrTransferSim />
        )}
      </Reveal>

      <div className="order-1 md:order-2">
        <Reveal>
          <h2 className="font-extrabold text-[clamp(1.5rem,3.4vw,2.3rem)] leading-tight text-[var(--text-primary)] mb-3">
            Pull my record from my insurance
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <Quote>I need my data from my Electronic Health Record (ePA)!</Quote>
        </Reveal>
        <Reveal delay={320}>
          <div className="mt-5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Database size={16} style={{ color: ACCENTS[1] }} />
            <span>
              <strong className="text-[var(--text-primary)]">
                {insurer.name}
              </strong>{" "}
              (health insurance) · ePA / EHR via{" "}
              <strong className="text-[var(--text-primary)]">
                GesundheitsID
              </strong>
            </span>
          </div>
        </Reveal>
        <Reveal delay={440}>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {(
              [
                { t: "Lab data", Icon: FlaskConical },
                { t: "Fitness data", Icon: Activity },
                { t: "Nutrition plan", Icon: Salad },
              ] as { t: string; Icon: LucideIcon }[]
            ).map(({ t, Icon }, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border bg-[var(--surface-2)]"
                style={{ borderColor: ACCENTS[1], color: ACCENTS[1] }}
              >
                <Icon size={15} /> {t}
              </span>
            ))}
          </div>
        </Reveal>
        <Reveal delay={560}>
          <button
            onClick={() => setTransferred(true)}
            disabled={transferred}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] disabled:opacity-70"
            style={{ background: ACCENTS[1] }}
          >
            {transferred ? (
              <>
                <ShieldCheck size={16} /> Transferred to the portal
              </>
            ) : (
              <>
                Authorize the transfer <ArrowRight size={16} />
              </>
            )}
          </button>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            GesundheitsID-authenticated · end-to-end encrypted · {insurer.short}{" "}
            cannot read it · withdraw any time
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/** Icon per donation-source id (data lives in journey-config). */
const SOURCE_ICON: Record<DataSource["id"], LucideIcon> = {
  ehr: Database,
  fitness: Activity,
  labs: FlaskConical,
};

/**
 * One real data source the patient contributes. Under NEXT_PUBLIC_DEMO_TK it
 * renders the git-ignored personal screenshot (TK ePA / Whoop / Blood Test);
 * the public default shows a brand-tinted icon tile with a generic label.
 */
function SourceCard({ s }: { s: DataSource }) {
  const [imgOk, setImgOk] = useState(true);
  const Icon = SOURCE_ICON[s.id];
  return (
    <div
      className="rounded-xl border bg-[var(--surface-2)] overflow-hidden h-full"
      style={{ borderColor: s.brand }}
    >
      <div className="h-[clamp(76px,10vw,104px)] bg-white relative">
        {s.screenshot && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={s.screenshot}
            alt={`${s.label} — ${s.sublabel} (real screenshot)`}
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div
            className="w-full h-full grid place-items-center"
            style={{ background: `${s.brand}14` }}
          >
            <Icon size={30} style={{ color: s.brand }} />
          </div>
        )}
      </div>
      <div className="p-2.5 flex items-start gap-2">
        <Icon
          size={15}
          className="mt-0.5 shrink-0"
          style={{ color: s.brand }}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
            {s.label}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] truncate">
            {s.sublabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/** ── Slide 3 — donate to research ────────────────────────────────────────── */
function SlideDonate() {
  const programs = [
    {
      name: "European Cardiovascular Risk Study",
      org: "PharmaCo Research AG",
      countries: "DE · NL · FR · ES",
    },
    {
      name: "T2D Progression Biomarkers",
      org: "Institut de Recherche Santé",
      countries: "DE · FR",
    },
  ];
  return (
    <div className="max-w-5xl mx-auto w-full">
      <Reveal>
        <h2 className="font-extrabold text-[clamp(1.4rem,3.2vw,2.1rem)] leading-tight text-[var(--text-primary)] mb-2 text-center">
          Donate my data to research I care about
        </h2>
      </Reveal>
      <Reveal delay={140} className="text-center">
        <Quote>I want to donate my data for specific research programs.</Quote>
      </Reveal>

      {/* the three real sources Maria contributes */}
      <Reveal delay={260} className="mt-5">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] mb-2.5">
          Contributing my real data
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-3xl mx-auto">
          {donationSources.map((s) => (
            <SourceCard key={s.id} s={s} />
          ))}
        </div>
      </Reveal>

      {/* into the programs she trusts */}
      <Reveal delay={420}>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] mt-5 mb-2.5">
          into programs I trust
        </p>
      </Reveal>
      <div className="grid sm:grid-cols-2 gap-3">
        {programs.map((p, i) => (
          <Reveal key={i} delay={500 + i * 120}>
            <div
              className="rounded-2xl border p-4 bg-[var(--surface-2)] h-full"
              style={{ borderColor: ACCENTS[2] }}
            >
              <div className="flex items-start justify-between gap-3">
                <HandHeart size={20} style={{ color: ACCENTS[2] }} />
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                  style={{ background: ACCENTS[2] }}
                >
                  CONSENT GRANTED
                </span>
              </div>
              <h3 className="font-bold text-[var(--text-primary)] mt-2 text-[clamp(0.95rem,1.9vw,1.15rem)]">
                {p.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {p.org}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                Federated across {p.countries}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={760}>
        <p className="mt-4 text-center text-sm text-[var(--text-secondary)] flex items-center justify-center gap-2">
          <ShieldCheck size={16} style={{ color: ACCENTS[2] }} />
          Federated queries reach many databases — my data never leaves the
          secure environment. Withdraw any time.
        </p>
      </Reveal>
    </div>
  );
}

/** ── Slide 4 — research results ──────────────────────────────────────────── */
function SlideResults() {
  const results = [
    {
      icon: Salad,
      q: "I changed my nutrition over 3 months — how are my cardiovascular risk & pre-diabetes?",
      r: "Cardiovascular risk ↓ 42% → 36%. HbA1c trending toward normal — pre-diabetes risk reduced.",
    },
    {
      icon: Wind,
      q: "Daily breathing exercises — any effect on stress, inflammation & oxygen?",
      r: "Resting stress markers ↓ ~18%. CRP (inflammation) ↓. Blood-oxygen (SpO₂) stable to improved.",
    },
    {
      icon: Activity,
      q: "I increased my daily sport routine — do you see any effect?",
      r: "Resting heart rate ↓ ~6 bpm. Fitness (VO₂ proxy) ↑. Body-weight trend ↓.",
    },
  ];
  return (
    <div className="max-w-5xl mx-auto w-full">
      <Reveal>
        <h2 className="font-extrabold text-[clamp(1.5rem,3.4vw,2.3rem)] leading-tight text-[var(--text-primary)] mb-1 text-center">
          My personal research results
        </h2>
      </Reveal>
      <Reveal delay={120}>
        <p className="text-center text-sm text-[var(--text-secondary)] mb-6">
          Insights computed from my donated data — synthetic, illustrative.
        </p>
      </Reveal>
      <div className="space-y-3">
        {results.map((x, i) => (
          <Reveal key={i} delay={240 + i * 150}>
            <div
              className="rounded-xl border p-4 sm:p-5 bg-[var(--surface-2)] flex items-start gap-4"
              style={{ borderColor: ACCENTS[3] }}
            >
              <span
                className="grid place-items-center w-10 h-10 rounded-xl text-white shrink-0"
                style={{ background: ACCENTS[3] }}
              >
                <x.icon size={20} />
              </span>
              <div>
                <p className="text-[clamp(0.9rem,1.8vw,1.05rem)] italic text-[var(--text-secondary)]">
                  &ldquo;{x.q}&rdquo;
                </p>
                <p className="text-[clamp(0.95rem,2vw,1.18rem)] font-semibold text-[var(--text-primary)] mt-1">
                  {x.r}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={760}>
        <p className="mt-6 text-center font-bold text-[clamp(1.1rem,2.6vw,1.6rem)] text-[var(--text-primary)]">
          My data. My identity. My insights.{" "}
          <span style={{ color: ACCENTS[3] }}>Sovereign, by design.</span>
        </p>
      </Reveal>
    </div>
  );
}

const SLIDES = [
  { label: "EHDS Patient Wallet", render: SlideIntro, accent: "var(--accent)" },
  { label: "1 · Register", render: SlideRegister, accent: ACCENTS[0] },
  { label: "2 · Get my EHR", render: SlideEhr, accent: ACCENTS[1] },
  { label: "3 · Donate to research", render: SlideDonate, accent: ACCENTS[2] },
  { label: "4 · Research results", render: SlideResults, accent: ACCENTS[3] },
];

export default function JourneyPage() {
  const [step, setStep] = useState(0);
  const last = SLIDES.length - 1;

  const go = useCallback(
    (dir: number) => setStep((s) => Math.min(last, Math.max(0, s + dir))),
    [last],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const Slide = SLIDES[step].render;

  return (
    <div className="relative flex flex-col h-[calc(100dvh-3rem)] overflow-hidden bg-[var(--surface)]">
      <style>{`
        @keyframes jrnyReveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .jrny-reveal { opacity: 0; animation: jrnyReveal 0.55s cubic-bezier(.2,.7,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .jrny-reveal { animation: none; opacity: 1; transform: none; }
        }
      `}</style>

      {/* top progress bar */}
      <div className="h-1 w-full bg-[var(--surface-2)] shrink-0">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(step / last) * 100}%`,
            background: SLIDES[step].accent,
          }}
        />
      </div>

      {/* slide */}
      <div className="flex-1 min-h-0 relative grid place-items-center px-5 sm:px-16 md:px-24 py-6 overflow-y-auto">
        <div key={step} className="w-full">
          <Slide />
        </div>

        {/* prev / next — always visible */}
        <button
          aria-label="Previous step"
          onClick={() => go(-1)}
          disabled={step === 0}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] shadow-md text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeft size={22} />
        </button>
        <button
          aria-label="Next step"
          onClick={() => go(1)}
          disabled={step === last}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 sm:w-12 sm:h-12 rounded-full shadow-md text-white hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none transition-opacity"
          style={{ background: SLIDES[step].accent }}
        >
          <ArrowRight size={22} />
        </button>
      </div>

      {/* footer controls — dots + counter */}
      <div className="shrink-0 flex items-center justify-center gap-4 py-3 border-t border-[var(--surface-2)]">
        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={i}
              aria-label={`Go to ${s.label}`}
              onClick={() => setStep(i)}
              className="rounded-full transition-all"
              style={{
                width: i === step ? 26 : 9,
                height: 9,
                background: i === step ? s.accent : "var(--text-secondary)",
                opacity: i === step ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <span className="text-xs text-[var(--text-secondary)] tabular-nums">
          {step + 1} / {SLIDES.length}
        </span>
      </div>
    </div>
  );
}
