"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

/** Assembled at runtime so the address is not in the page source for
 *  scrapers. The request goes out from the visitor's own mail app: no mail
 *  server, no credentials, and it works in the static GitHub Pages build. */
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

export function TestflightRequestForm() {
  const [name, setName] = useState("");
  const [appleId, setAppleId] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    window.open(buildTestflightMailto(name, appleId, note), "_self");
    setSent(true);
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
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-(--surface-2) text-(--text-primary) border border-(--border-ui) hover:border-layer2 transition-colors"
      >
        <Send size={16} aria-hidden="true" />
        Write the request
      </button>
      <p className="text-xs text-(--text-secondary)" role="status">
        {sent ? (
          <>
            Your mail app should now show the request, ready to send. If nothing
            opened, write to{" "}
            <a
              href={`mailto:${RECIPIENT}`}
              className="text-(--accent) underline underline-offset-2"
            >
              {RECIPIENT}
            </a>
            .
          </>
        ) : (
          "This opens your own mail app with the request filled in; nothing is sent until you press send there."
        )}
      </p>
    </form>
  );
}
