import trusted from "@/content/trusted-issuers.json";

/**
 * The issuers the control plane trusts, each for the credential types it may
 * issue (#710, ADR-064). The list is ui/src/content/trusted-issuers.json, the
 * same file the identity checks compare the control plane's settings with
 * (TRUST-6.1), so what this shows is what the connector enforces.
 */
export function TrustedIssuers() {
  return (
    <div className="mt-8" data-testid="trusted-issuers">
      <h3 className="text-sm font-semibold mb-1 text-(--text-primary)">
        Trusted issuers
      </h3>
      <p className="text-(--text-secondary) text-xs mb-3">
        A credential counts only if its issuer is trusted for its type; one that
        is not makes the connector refuse the whole request.
      </p>
      <ul className="space-y-3">
        {trusted.issuers.map((issuer) => (
          <li
            key={issuer.alias}
            className="rounded-lg border border-(--border) bg-(--surface-2)/50 p-4"
          >
            <div className="font-medium text-sm">{issuer.name}</div>
            <code className="block text-xs text-(--text-secondary) break-all mt-0.5">
              {issuer.did}
            </code>
            <p className="text-xs text-(--text-secondary) mt-1">
              {issuer.role}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2" aria-label="May issue">
              {issuer.types.map((type) => (
                <span
                  key={type}
                  className="text-xs px-2 py-0.5 rounded-sm bg-layer2/15 text-layer2-safe"
                >
                  {type}
                </span>
              ))}
            </div>
            <div className="text-xs text-(--text-secondary) mt-2">
              Trusted on: {issuer.environments.join(", ")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
