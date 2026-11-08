import Link from "next/link";
import { PROVIDER, LEGAL_LAST_UPDATED } from "@/lib/legal-notice";
import { REPO_URL } from "@/lib/docs/published-docs";

export const metadata = {
  title: "Impressum / Legal notice",
  description:
    "Anbieterkennzeichnung nach § 5 DDG und Verantwortlicher nach § 18 Abs. 2 MStV für die EHDS-Demonstration. Legal notice of the EHDS demonstrator.",
};

/**
 * The legal notice. German law asks for it in German; the English text below
 * is a translation for visitors. Both read the provider from
 * `@/lib/legal-notice`, which the privacy policy shares.
 */
export default function ImpressumPage() {
  const p = PROVIDER;
  const address = (
    <address className="not-italic">
      {p.name}
      <br />
      {p.street}
      <br />
      {p.postalCode} {p.city}
      <br />
      {p.country}
    </address>
  );
  const contact = (
    <ul className="list-none p-0">
      <li>
        E-Mail: <a href={`mailto:${p.email}`}>{p.email}</a>
      </li>
      <li>
        GitHub: <a href={`${REPO_URL}/issues`}>Issues</a>,{" "}
        <a href={`${REPO_URL}/discussions`}>Discussions</a>
      </li>
      {p.phone && (
        <li>
          Telefon / Phone:{" "}
          <a href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a>
        </li>
      )}
    </ul>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 [&_a]:underline [&_a]:underline-offset-2">
      <h1 className="text-3xl font-bold mb-2">Impressum</h1>
      <p className="text-sm text-(--text-secondary) mb-8">
        Stand / Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <section lang="de" className="space-y-4 mb-12">
        <h2 className="text-xl font-semibold">Angaben gemäß § 5 DDG</h2>
        {address}

        <h2 className="text-xl font-semibold">Kontakt</h2>
        {contact}

        <h2 className="text-xl font-semibold">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>{p.name}, Anschrift wie oben.</p>

        <h2 className="text-xl font-semibold">Über dieses Angebot</h2>
        <p>
          Diese Website ist eine nicht-kommerzielle Demonstration des
          Europäischen Gesundheitsdatenraums (Verordnung (EU) 2025/327). Alle
          Patientinnen und Patienten sind synthetisch, alle Organisationen
          erfunden. Es werden keine echten Gesundheitsdaten verarbeitet. Die
          Website steht in keiner Verbindung zur Europäischen Kommission oder zu
          einer Behörde. Der Quellcode ist öffentlich auf{" "}
          <a href={REPO_URL}>GitHub</a>.
        </p>

        <h2 className="text-xl font-semibold">Haftung für Links</h2>
        <p>
          Diese Website verweist auf Websites Dritter, auf deren Inhalte ich
          keinen Einfluss habe. Für sie ist der jeweilige Anbieter
          verantwortlich. Werden mir Rechtsverletzungen bekannt, entferne ich
          den betreffenden Link umgehend.
        </p>

        <p>
          Wie diese Website mit personenbezogenen Daten umgeht, steht in der{" "}
          <Link href="/datenschutz">Datenschutzerklärung</Link>.
        </p>
      </section>

      <section lang="en" className="space-y-4 border-t border-(--border) pt-8">
        <h2 className="text-2xl font-bold">Legal notice (English)</h2>
        <h3 className="text-lg font-semibold">
          Provider under § 5 of the German Digital Services Act (DDG)
        </h3>
        {address}

        <h3 className="text-lg font-semibold">Contact</h3>
        {contact}

        <h3 className="text-lg font-semibold">
          Responsible for the content under § 18(2) MStV
        </h3>
        <p>{p.name}, address as above.</p>

        <h3 className="text-lg font-semibold">About this site</h3>
        <p>
          This website is a non-commercial demonstration of the European Health
          Data Space (Regulation (EU) 2025/327). Every patient is synthetic and
          every organisation is fictional; no real health data is processed. The
          site is not affiliated with the European Commission or any authority.
          The source code is public on <a href={REPO_URL}>GitHub</a>.
        </p>

        <h3 className="text-lg font-semibold">Links</h3>
        <p>
          This site links to third-party websites whose content I do not
          control; their providers are responsible for it. If I learn that a
          linked page breaks the law, I remove the link without delay.
        </p>

        <p>
          How this site handles personal data is set out in the{" "}
          <Link href="/datenschutz">privacy policy</Link>.
        </p>
      </section>
    </div>
  );
}
