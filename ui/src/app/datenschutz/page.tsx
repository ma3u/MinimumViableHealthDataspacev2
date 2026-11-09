import Link from "next/link";
import { PROVIDER, LEGAL_LAST_UPDATED } from "@/lib/legal-notice";
import { STATIC_SITE_URL } from "@/lib/offline-mode";
import { BASE_PATH } from "@/lib/static-export";

export const metadata = {
  title: "Datenschutzerklärung / Privacy policy",
  description:
    "Welche personenbezogenen Daten die EHDS-Demonstration verarbeitet, warum und wie lange. What personal data the EHDS demonstrator processes, why and for how long.",
};

/**
 * The privacy policy (Art. 13 GDPR) for both copies of the site: the live
 * demo on Azure and the static demo on GitHub Pages. Every statement is
 * checked against the code: no analytics, no third-party host in the CSP
 * (middleware.ts), browser storage only for the theme, the language and the
 * demo persona, and session cookies only after a sign-in.
 */
export default function DatenschutzPage() {
  const p = PROVIDER;
  const controller = (
    <address className="not-italic">
      {p.name}
      <br />
      {p.street}, {p.postalCode} {p.city}, {p.country}
      <br />
      E-Mail: <a href={`mailto:${p.email}`}>{p.email}</a>
    </address>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 [&_a]:underline [&_a]:underline-offset-2">
      <h1 className="text-3xl font-bold mb-2">Datenschutzerklärung</h1>
      <p className="text-sm text-(--text-secondary) mb-8">
        Stand / Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <section lang="de" className="space-y-4 mb-12">
        <h2 className="text-xl font-semibold">1. Verantwortlicher</h2>
        {controller}

        <h2 className="text-xl font-semibold">2. Kurz gesagt</h2>
        <p>
          Diese Website ist eine Demonstration mit ausschließlich synthetischen
          Patientendaten und erfundenen Organisationen. Sie verwendet keine
          Analyse- oder Werbedienste, bindet keine Inhalte Dritter ein und lädt
          Schriften und Skripte nur vom eigenen Server.
        </p>

        <h2 className="text-xl font-semibold">3. Hosting und Server-Logs</h2>
        <p>
          Die Live-Demo (ehds.mabu.red) läuft in Microsoft Azure, Region
          Westeuropa (Niederlande). Microsoft verarbeitet die Daten als
          Auftragsverarbeiter. Beim Aufruf werden technisch notwendige Daten
          protokolliert: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Statuscode
          und Browserkennung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO;
          das berechtigte Interesse ist der sichere Betrieb. Betriebs-Logs
          werden nach 30 Tagen gelöscht, Warn- und Fehlermeldungen nach 90
          Tagen.
        </p>
        <p>
          Die statische Demo ({STATIC_SITE_URL.replace("https://", "")}) wird
          über GitHub Pages der GitHub, Inc. (USA) ausgeliefert. GitHub
          protokolliert dabei die IP-Adresse der Besucher; die Übermittlung in
          die USA stützt sich auf den Angemessenheitsbeschluss zum EU-US Data
          Privacy Framework. Einzelheiten stehen in der{" "}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            Datenschutzerklärung von GitHub
          </a>
          .
        </p>

        <h2 className="text-xl font-semibold">4. Anmeldung und Cookies</h2>
        <p>
          Wer sich mit einem der Demo-Konten anmeldet, erhält Sitzungs-Cookies
          der Anmeldung (NextAuth auf ehds.mabu.red, Keycloak auf
          auth.ehds.mabu.red). Sie sind für die Anmeldung unbedingt erforderlich
          (§ 25 Abs. 2 Nr. 2 TDDDG) und enden mit der Sitzung oder der
          Abmeldung. Die Demo-Konten gehören erfundenen Personen; Aktionen, die
          mit ihnen ausgeführt werden, hält das Audit-Protokoll der Demo bis zu
          drei Jahre fest. Wer sich mit einer Test-Brieftasche (EUDI Wallet)
          anmeldet, legt nur Testdaten vor.
        </p>

        <h2 className="text-xl font-semibold">5. Speicher im Browser</h2>
        <p>
          Im lokalen Speicher Ihres Browsers merkt sich die Website das
          Farbschema (<code>theme</code>), die Sprache (
          <code>catalog-metadata-language</code>), die gewählte Demo-Rolle (
          <code>demo-persona</code>) und Ihre letzten fünf Suchbegriffe der
          Seitensuche (<code>site-search-recent</code>). Die Suche selbst läuft
          in Ihrem Browser; Suchbegriffe werden nicht übertragen. Diese Werte
          verlassen Ihr Gerät nicht und lassen sich in den Browser-Einstellungen
          löschen, die Suchbegriffe auch über „Löschen“ in der Suche.
        </p>

        <h2 className="text-xl font-semibold">6. Kontakt</h2>
        <p>
          Wenn Sie per E-Mail oder über GitHub-Issues Kontakt aufnehmen,
          verarbeite ich Ihre Angaben nur, um Ihre Anfrage zu beantworten (Art.
          6 Abs. 1 lit. f DSGVO), und lösche sie, wenn sie erledigt ist.
        </p>

        <h2 className="text-xl font-semibold">7. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch
          (Art. 15 bis 21 DSGVO). Wenden Sie sich dazu an die oben genannte
          Adresse. Sie können sich außerdem bei einer
          Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
        </p>

        <p>
          Für die iPhone-App Klarbefund gilt eine{" "}
          <a href={`${BASE_PATH}/meinbefund/privacy.html`}>
            eigene Datenschutzerklärung
          </a>
          . Anbieterangaben stehen im <Link href="/impressum">Impressum</Link>.
        </p>
      </section>

      <section lang="en" className="space-y-4 border-t border-(--border) pt-8">
        <h2 className="text-2xl font-bold">Privacy policy (English)</h2>

        <h3 className="text-lg font-semibold">1. Controller</h3>
        {controller}

        <h3 className="text-lg font-semibold">2. In short</h3>
        <p>
          This website is a demonstration with synthetic patient data and
          fictional organisations only. It uses no analytics or advertising
          services, embeds no third-party content, and loads fonts and scripts
          from its own server only.
        </p>

        <h3 className="text-lg font-semibold">3. Hosting and server logs</h3>
        <p>
          The live demo (ehds.mabu.red) runs on Microsoft Azure, region West
          Europe (the Netherlands), with Microsoft as processor. Each request
          logs what is technically necessary: IP address, time, address
          requested, status code and browser identifier. The legal basis is Art.
          6(1)(f) GDPR, the legitimate interest being secure operation.
          Operational logs are deleted after 30 days, warnings and errors after
          90.
        </p>
        <p>
          The static demo ({STATIC_SITE_URL.replace("https://", "")}) is served
          by GitHub Pages, GitHub, Inc. (USA), which logs visitors&apos; IP
          addresses; the transfer to the USA relies on the adequacy decision for
          the EU-US Data Privacy Framework. See{" "}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
            GitHub&apos;s privacy statement
          </a>
          .
        </p>

        <h3 className="text-lg font-semibold">4. Sign-in and cookies</h3>
        <p>
          Signing in with one of the demo accounts sets session cookies
          (NextAuth on ehds.mabu.red, Keycloak on auth.ehds.mabu.red). They are
          strictly necessary for the sign-in (§ 25(2) no. 2 TDDDG) and end with
          the session or on sign-out. The demo accounts belong to fictional
          people; the demo&apos;s audit trail keeps what is done with them for
          up to three years. Signing in with a test EUDI wallet presents test
          data only.
        </p>

        <h3 className="text-lg font-semibold">5. Browser storage</h3>
        <p>
          Your browser&apos;s local storage keeps the colour scheme (
          <code>theme</code>), the language (
          <code>catalog-metadata-language</code>), the demo role you chose (
          <code>demo-persona</code>) and your last five site searches (
          <code>site-search-recent</code>). The search itself runs in your
          browser; what you search for is never sent. These values never leave
          your device and can be cleared in the browser settings, the searches
          also with &ldquo;Clear&rdquo; in the search.
        </p>

        <h3 className="text-lg font-semibold">6. Contact</h3>
        <p>
          If you write by email or through GitHub issues, I process what you
          send only to answer (Art. 6(1)(f) GDPR) and delete it once the matter
          is closed.
        </p>

        <h3 className="text-lg font-semibold">7. Your rights</h3>
        <p>
          You have the rights of access, rectification, erasure, restriction,
          portability and objection (Arts. 15 to 21 GDPR); write to the address
          above. You may also complain to a data protection supervisory
          authority (Art. 77 GDPR).
        </p>

        <p>
          The Klarbefund iPhone app has{" "}
          <a href={`${BASE_PATH}/meinbefund/privacy.html`}>
            its own privacy policy
          </a>
          . The provider details are in the{" "}
          <Link href="/impressum">legal notice</Link>.
        </p>
      </section>
    </div>
  );
}
