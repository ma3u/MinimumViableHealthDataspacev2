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
            Klarbefund: real data for the dataspace, held by the patient
          </h2>
        </div>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          Health dataspaces are shown with synthetic patients, this one
          included. That demonstrates the plumbing, but not the rules: GDPR, the
          EHDS and the AI Act are about data that belongs to a person, who holds
          it, where it came from, and what its owner agreed to. Real data is
          what is missing, and it is the hardest to bring in lawfully.
        </p>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-4">
          Klarbefund brings it in from the person&apos;s side. Scan a paper lab
          report or import the PDF, and the iPhone turns it into values coded
          with LOINC where a code exists, set against published reference
          ranges, and marked with where each one came from. They go to the
          dataspace only when the person decides they should.
        </p>
        <ul className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-4 space-y-2">
          <li>
            <strong className="text-(--text-primary)">GDPR.</strong> Values are
            read and stored on the phone, encrypted, and nothing leaves it
            unless the person sends it (privacy by design, Art. 25). Everything
            can be exported as PDF, FHIR and OMOP (portability, Art. 20), and
            the account deleted in the app (erasure, Art. 17).
          </li>
          <li>
            <strong className="text-(--text-primary)">EHDS.</strong> The person
            creates an account on this hub and adds their own values to their
            own record, decided once: FHIR R4 Observations, coded with LOINC,
            marked preliminary and with their source, never mistaken for a
            laboratory&apos;s result. Registry and research use stay a separate
            consent.
          </li>
          <li>
            <strong className="text-(--text-primary)">AI Act.</strong> Asking an
            AI about one&apos;s values happens only on request, names the
            provider and model each time, and every answer says it is not a
            diagnosis (transparency, Art. 50).
          </li>
        </ul>
        <p className="text-(--text-secondary) text-sm leading-relaxed max-w-2xl mb-3">
          The app is in a{" "}
          <strong className="text-(--text-primary)">
            public TestFlight beta
          </strong>{" "}
          for iPhone with iOS 26. Join with one tap, no request needed.
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
