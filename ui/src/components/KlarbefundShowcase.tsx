import { Smartphone } from "lucide-react";
import { IS_STATIC } from "@/lib/static-export";
import { TestflightJoin } from "@/components/TestflightJoin";
import { KlarbefundTourPhone } from "@/components/KlarbefundTourPhone";

/** The GitHub Pages export is served under a basePath; plain <video> and <img>
 *  URLs must carry it (same pattern as the journey page). */
const BASE_PATH = IS_STATIC ? "/MinimumViableHealthDataspacev2" : "";
const REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2";
const TOUR_ALT =
  "A tour through the Klarbefund app with invented data: the list of reports, a report's values and its scan, trends against published ranges, earlier measurements, connecting to the EHDS record, the three consents, asking an AI, and the privacy page";

export function KlarbefundShowcase() {
  return (
    <section
      className="mb-12 sm:mb-16 animate-fade-in-up grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-8 lg:gap-12 items-center"
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
            Klarbefund: real data for the dataspace, held by the patient
          </h2>
        </div>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          Health dataspaces run on synthetic patients, this one included. That
          shows the plumbing, not the rules: GDPR, the EHDS and the AI Act are
          about data that belongs to a person. Real data is what is missing, and
          it is the hardest to bring in lawfully.
        </p>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-4">
          Klarbefund brings it in from the person&apos;s side. Scan a paper lab
          report or import the PDF, and the iPhone turns it into LOINC-coded
          values set against published reference ranges, each marked with its
          source. They reach the dataspace only when the person decides.
        </p>
        <ul className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-4 space-y-2">
          <li>
            <strong className="text-(--text-primary)">GDPR.</strong> Values stay
            on the phone, encrypted, until the person sends them (Art. 25).
            Export as PDF, FHIR and OMOP (Art. 20); delete the account in the
            app (Art. 17).
          </li>
          <li>
            <strong className="text-(--text-primary)">EHDS.</strong> The person
            creates an account on this hub and adds their values to their own
            record: FHIR R4 Observations, LOINC-coded, marked preliminary and
            with their source. Research use is a separate consent.
          </li>
          <li>
            <strong className="text-(--text-primary)">AI Act.</strong> An AI
            answers only when asked, names provider and model each time, and
            never calls it a diagnosis (Art. 50).
          </li>
        </ul>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          The app is in a{" "}
          <strong className="text-(--text-primary)">
            public TestFlight beta
          </strong>{" "}
          for iPhone with iOS 26. Join with one tap.
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
