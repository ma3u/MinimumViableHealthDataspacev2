"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";

/** Assembled at runtime so the address is not in the page source for
 *  scrapers. Only the mailto draft uses it: the static GitHub Pages build,
 *  which has no API, and the fallback when the hub cannot send (ADR-048). */
const RECIPIENT = ["matthias.buchhorn", "web.de"].join("@");

export function buildTestflightMailto(
  name: string,
  appleId: string,
  note: string,
): string {
  const subject = "Klarbefund TestFlight: please add me as a tester";
  const body = [
    "Hello Matthias,",
    "",
    "please add me to the Klarbefund internal preview on TestFlight.",
    "",
    `Name: ${name}`,
    `Apple ID (for the TestFlight invitation): ${appleId}`,
    ...(note.trim() ? ["", note.trim()] : []),
    "",
    "Sent from the request form on the EHDS demo start page.",
  ].join("\n");
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

type Phase = "idle" | "sending" | "sent" | "busy" | "failed" | "drafted";

export function TestflightRequestForm() {
  const [name, setName] = useState("");
  const [appleId, setAppleId] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (IS_STATIC) {
      window.open(buildTestflightMailto(name, appleId, note), "_self");
      setPhase("drafted");
      return;
    }
    setPhase("sending");
    try {
      const res = await fetch("/api/testflight-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, appleId, note, website }),
      });
      if (res.status === 202) {
        setPhase("sent");
        setName("");
        setAppleId("");
        setNote("");
      } else {
        setPhase(res.status === 429 ? "busy" : "failed");
      }
    } catch {
      setPhase("failed");
    }
  }

  const field =
    "w-full rounded-lg border border-(--border-ui) bg-(--surface-2) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-secondary) focus:outline-none focus:ring-2 focus:ring-(--accent)";

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="testflight-form-title"
      className="rounded-xl border border-(--border) bg-(--surface)/60 p-4 space-y-3"
    >
      <h3
        id="testflight-form-title"
        className="text-sm font-semibold text-(--text-primary)"
      >
        Request access to the TestFlight preview
      </h3>
      <div>
        <label
          htmlFor="tf-name"
          className="block text-xs text-(--text-secondary) mb-1"
        >
          Your name
        </label>
        <input
          id="tf-name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </div>
      <div>
        <label
          htmlFor="tf-apple-id"
          className="block text-xs text-(--text-secondary) mb-1"
        >
          Apple ID email (the invitation goes there)
        </label>
        <input
          id="tf-apple-id"
          type="email"
          required
          autoComplete="email"
          value={appleId}
          onChange={(e) => setAppleId(e.target.value)}
          className={field}
        />
      </div>
      <div>
        <label
          htmlFor="tf-note"
          className="block text-xs text-(--text-secondary) mb-1"
        >
          Anything you would like to add (optional)
        </label>
        <textarea
          id="tf-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={field}
        />
      </div>
      {/* Honeypot: hidden from people and screen readers, filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0">
        <label htmlFor="tf-website">Website</label>
        <input
          id="tf-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={phase === "sending"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-(--surface-2) text-(--text-primary) border border-(--border-ui) hover:border-layer2 transition-colors disabled:opacity-60"
      >
        <Send size={16} aria-hidden="true" />
        {IS_STATIC
          ? "Write the request"
          : phase === "sending"
            ? "Sending…"
            : "Send the request"}
      </button>
      <p className="text-xs text-(--text-secondary)" role="status">
        <TestflightStatus
          phase={phase}
          mailto={
            phase === "failed" || phase === "drafted"
              ? buildTestflightMailto(name, appleId, note)
              : ""
          }
        />
      </p>
    </form>
  );
}

function TestflightStatus({ phase, mailto }: { phase: Phase; mailto: string }) {
  const link = "text-(--accent) underline underline-offset-2";
  switch (phase) {
    case "sending":
      return <>Sending your request…</>;
    case "sent":
      return (
        <>
          Thank you, your request is on its way. The TestFlight invitation will
          arrive at your Apple ID email.
        </>
      );
    case "busy":
      return (
        <>Too many requests from here just now. Please try again in an hour.</>
      );
    case "failed":
      return (
        <>
          The request could not be sent from here.{" "}
          <a href={mailto} className={link}>
            Write it in your mail app instead
          </a>
          , it is filled in already.
        </>
      );
    case "drafted":
      return (
        <>
          Your mail app should now show the request, ready to send. If nothing
          opened, write to{" "}
          <a href={`mailto:${RECIPIENT}`} className={link}>
            {RECIPIENT}
          </a>
          .
        </>
      );
    default:
      return IS_STATIC ? (
        <>
          This opens your own mail app with the request filled in; nothing is
          sent until you press send there.
        </>
      ) : (
        <>
          Goes straight to Matthias. Your Apple ID is used only for the
          TestFlight invitation.
        </>
      );
  }
}
