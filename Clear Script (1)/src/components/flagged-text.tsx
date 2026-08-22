import type { ReactNode } from "react";
import type { Flag } from "@/lib/job";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights flagged terms (doses, drug names, durations) inside a block of text.
 * Terms absent from the back-translation are the divergences a clinician must catch,
 * so callers pass `divergent` for that panel.
 */
export function FlaggedText({
  text,
  flags,
  divergentTerms = [],
  className,
  dir,
}: {
  text: string;
  flags: Flag[];
  divergentTerms?: string[];
  className?: string;
  dir?: "ltr" | "rtl";
}) {
  const terms = flags.map((f) => f.term).filter((t) => t.trim().length > 0);
  if (terms.length === 0) {
    return (
      <p className={className} dir={dir}>
        {text}
      </p>
    );
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  const nodes: ReactNode[] = parts.map((part, i) => {
    const flag = flags.find((f) => f.term.toLowerCase() === part.toLowerCase());
    if (!flag) return part;
    const divergent = divergentTerms.some((t) => t.toLowerCase() === part.toLowerCase());
    return (
      <mark
        key={`${part}-${i}`}
        className="flag"
        data-divergent={divergent ? "true" : "false"}
        title={`${flag.kind} · confidence ${flag.confidence.toFixed(2)}`}
      >
        {part}
      </mark>
    );
  });

  return (
    <p className={className} dir={dir}>
      {nodes}
    </p>
  );
}

/** Terms that appear in the source script but not in the back-translation. */
/** Spelling/format differences that are NOT divergences: UK/US medical
 * spellings and spacing between a number and its unit. */
const SPELLING_EQUIVALENTS: Array<[RegExp, string]> = [
  [/diarrhoea/g, "diarrhea"],
  [/anaemia/g, "anemia"],
  [/oedema/g, "edema"],
  [/haemorrh/g, "hemorrh"],
  [/paediatric/g, "pediatric"],
  [/oesophag/g, "esophag"],
];

function normalizeForMatch(text: string) {
  let out = text.toLowerCase();
  for (const [pattern, replacement] of SPELLING_EQUIVALENTS) out = out.replace(pattern, replacement);
  return out
    .replace(/(\d)\s+(mg|g|ml|mcg|µg|iu)\b/g, "$1$2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * A term is only reported as divergent when the evidence agrees it is:
 * translations legitimately paraphrase, so literal absence alone is not a
 * failure. We flag when the semantic round-trip score says the meaning
 * slipped (< 0.8), or when the term is absent even after normalisation AND
 * the score is not near-certain (< 0.95).
 */
export function findDivergences(flags: Flag[], backTranslation: string) {
  const haystack = normalizeForMatch(backTranslation);
  return flags
    .filter((f) => {
      const found = haystack.includes(normalizeForMatch(f.term));
      if (f.confidence < 0.8) return true;
      return !found && f.confidence < 0.95;
    })
    .map((f) => f.term);
}
