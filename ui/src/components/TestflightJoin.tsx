import { ExternalLink } from "lucide-react";

/** The public TestFlight link of the external group "EHDS beta" (ADR-050). */
export const TESTFLIGHT_URL = "https://testflight.apple.com/join/ssADSXX6";

/**
 * Joining the Klarbefund beta: a button on a phone, a QR code on a computer.
 *
 * Replaces the request form (ADR-048), which mailed each request to the
 * maintainer, who then added testers by hand. Apple's public link admits up to
 * 200 testers on its own, and works the same in the static GitHub Pages build,
 * which never had a server to mail from. The QR code is a committed SVG
 * (`public/images/klarbefund-testflight-qr.svg`), so nothing is generated in
 * the browser and nothing is fetched from a third party.
 */
export function TestflightJoin({ basePath = "" }: { basePath?: string }) {
  return (
    <div
      className="flex flex-col sm:flex-row items-start gap-5 rounded-lg border border-(--border) bg-(--surface) p-4"
      data-testid="testflight-join"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${basePath}/images/klarbefund-testflight-qr.svg`}
        alt="QR code: join the Klarbefund beta on TestFlight"
        width={132}
        height={132}
        className="rounded bg-white p-1 hidden sm:block"
      />
      <div className="text-sm">
        <a
          href={TESTFLIGHT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded bg-(--accent) px-3 py-2 font-medium text-white hover:opacity-90"
        >
          Join the beta on TestFlight
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <p className="mt-2 text-(--text-secondary) leading-relaxed">
          Tap the button on your iPhone, or scan the code with its camera.
          TestFlight is Apple&apos;s app for trying apps before release. Up to
          200 testers, iOS 26 or later.
        </p>
      </div>
    </div>
  );
}
