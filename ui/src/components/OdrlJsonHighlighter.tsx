"use client";

import { useMemo } from "react";

/* ── ODRL / EDC vocabulary terms that get special accent colouring ── */

const ODRL_KEYWORDS = new Set([
  "odrl:permission",
  "odrl:prohibition",
  "odrl:duty",
  "odrl:obligation",
  "odrl:action",
  "odrl:constraint",
  "odrl:leftOperand",
  "odrl:operator",
  "odrl:rightOperand",
  "odrl:assignee",
  "odrl:assigner",
  "odrl:target",
  "odrl:use",
  "odrl:Set",
  "odrl:Offer",
  "odrl:Agreement",
  "odrl:eq",
  "odrl:neq",
  "odrl:gt",
  "odrl:gteq",
  "odrl:lt",
  "odrl:lteq",
  "odrl:isAnyOf",
  "odrl:isAllOf",
  "odrl:isNoneOf",
  "odrl:commercialize",
]);

const EDC_KEYWORDS = new Set([
  "edc:PolicyDefinition",
  "edc:policy",
  "edc:purpose",
  "edc:inForceDate",
  "edc:duration",
  "edc:anonymize",
  "edc:pseudonymize",
  "edc:minimizeData",
  "edc:kAnonymity",
  "edc:reIdentify",
  "edc:aggregateOnly",
  "edc:maintainAuditTrail",
  "edc:secureProcessingEnvironment",
  "edc:extractTrainingData",
  "edc:publishIndividualLevel",
  "edc:secondaryUse",
  "edc:thirdPartySharing",
  "edc:logAccess",
  "edc:notifyPatient",
  "edc:patientConsent",
]);

/** CSS classes for each token type */
const C = {
  key: "text-purple-400",
  string: "text-emerald-400",
  number: "text-amber-400",
  bool: "text-sky-400",
  null: "text-gray-500 italic",
  brace: "text-gray-500",
  odrl: "text-cyan-400 font-semibold",
  edc: "text-orange-400 font-semibold",
  punc: "text-gray-500",
} as const;

interface Token {
  cls: string;
  text: string;
}

/** Tokenise a JSON string into styled spans. */
function tokenise(json: string): Token[] {
  const tokens: Token[] = [];
  // Match JSON tokens: strings, numbers, booleans, null, structural chars
  const re =
    /("(?:[^"\\]|\\.)*")\s*(:?)|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false)\b|\b(null)\b|([{}[\],])/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(json)) !== null) {
    // Whitespace / newlines between tokens
    if (m.index > lastIndex) {
      tokens.push({ cls: "", text: json.slice(lastIndex, m.index) });
    }

    if (m[1] !== undefined) {
      // String — might be a key (followed by ':') or a value
      const raw = m[1];
      const isKey = m[2] === ":";
      const inner = raw.slice(1, -1); // without quotes
      if (isKey) {
        // Determine if it's an ODRL/EDC keyword
        const cls = ODRL_KEYWORDS.has(inner)
          ? C.odrl
          : EDC_KEYWORDS.has(inner)
            ? C.edc
            : C.key;
        tokens.push({ cls, text: raw });
        tokens.push({ cls: C.punc, text: ":" });
      } else {
        // String value — check for vocabulary terms inside values
        const cls = ODRL_KEYWORDS.has(inner)
          ? C.odrl
          : EDC_KEYWORDS.has(inner)
            ? C.edc
            : C.string;
        tokens.push({ cls, text: raw });
      }
    } else if (m[3] !== undefined) {
      tokens.push({ cls: C.number, text: m[3] });
    } else if (m[4] !== undefined) {
      tokens.push({ cls: C.bool, text: m[4] });
    } else if (m[5] !== undefined) {
      tokens.push({ cls: C.null, text: m[5] });
    } else if (m[6] !== undefined) {
      tokens.push({ cls: C.brace, text: m[6] });
    }

    lastIndex = re.lastIndex;
  }

  // Trailing whitespace
  if (lastIndex < json.length) {
    tokens.push({ cls: "", text: json.slice(lastIndex) });
  }

  return tokens;
}

interface OdrlJsonHighlighterProps {
  data: unknown;
  className?: string;
}

export default function OdrlJsonHighlighter({
  data,
  className,
}: OdrlJsonHighlighterProps) {
  const tokens = useMemo(() => {
    const json = JSON.stringify(data, null, 2);
    return tokenise(json);
  }, [data]);

  return (
    <pre className={`overflow-auto text-xs leading-relaxed ${className ?? ""}`}>
      {tokens.map((t, i) =>
        t.cls ? (
          <span key={i} className={t.cls}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}
    </pre>
  );
}
