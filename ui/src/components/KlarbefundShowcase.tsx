import { Smartphone } from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";
import { TestflightJoin } from "@/components/TestflightJoin";
import { KlarbefundTourPhone } from "@/components/KlarbefundTourPhone";

/** The GitHub Pages export is served under a basePath; plain <video> and <img>
 *  URLs must carry it (same pattern as the journey page). */
const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const TOUR_ALT =
  "A tour through the Klarbefund app with invented data: the list of reports, a report's values, trends against published ranges, and earlier measurements";

export function KlarbefundShowcase() {
  return (
    <section
      className="mb-12 sm:mb-16 animate-fade-in-up grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-8 lg:gap-12 items-start"
      style={{ animationDelay: "100ms" }}
      aria-labelledby="klarbefund-title"
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Smartphone
            size={18}
            className="text-teal-800 dark:text-teal-300"
            aria-hidden="true"
          />
          <h2 id="klarbefund-title" className="text-lg sm:text-xl font-bold">
            Klarbefund: your lab reports on the iPhone
          </h2>
        </div>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          Scan a paper lab report or import the PDF, and Klarbefund turns it
          into values you can check against the paper and follow over time:
          coded with LOINC where a code exists, set against published reference
          ranges, and marked with where each one came from. Everything runs on
          the phone and stays encrypted there; nothing leaves the device unless
          you send it.
        </p>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          The app is in a{" "}
          <strong className="text-(--text-primary)">
            public TestFlight beta
          </strong>{" "}
          for iPhone with iOS 26. Join with one tap; no request, no account on
          this hub.
        </p>
        <div className="flex flex-wrap gap-3 text-sm mb-5">
          <a
            href={`${REPO}/blob/main/docs/klarbefund/README.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--accent) underline underline-offset-2 hover:text-(--text-primary) transition-colors"
          >
            The app, screen by screen
          </a>
          <a
            href={`${BASE_PATH}/meinbefund/privacy.html`}
            className="text-(--accent) underline underline-offset-2 hover:text-(--text-primary) transition-colors"
          >
            Privacy policy
          </a>
        </div>
        <div className="max-w-xl">
          <TestflightJoin basePath={BASE_PATH} />
        </div>
      </div>

      <KlarbefundTourPhone basePath={BASE_PATH} alt={TOUR_ALT} />
    </section>
  );
}
