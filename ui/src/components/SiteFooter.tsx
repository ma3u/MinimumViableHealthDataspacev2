import Link from "next/link";
import { T } from "@/lib/i18n/translate";
import { REPO_URL } from "@/lib/docs/published-docs";

/**
 * The legal notice and the privacy policy, one click from every page as
 * § 5 DDG asks ("leicht erkennbar, unmittelbar erreichbar").
 */
export default function SiteFooter() {
  return (
    <footer
      className="border-t border-(--border) px-6 py-4 text-sm text-(--text-secondary)"
      data-testid="site-footer"
    >
      <nav
        aria-label="Legal"
        className="max-w-7xl mx-auto flex flex-wrap gap-x-6 gap-y-2"
      >
        <Link href="/impressum" className="hover:text-(--text-primary)">
          <T area="common">{"Legal notice"}</T>
        </Link>
        <Link href="/datenschutz" className="hover:text-(--text-primary)">
          <T area="common">{"Privacy policy"}</T>
        </Link>
        <a href={REPO_URL} className="hover:text-(--text-primary)">
          GitHub
        </a>
      </nav>
    </footer>
  );
}
