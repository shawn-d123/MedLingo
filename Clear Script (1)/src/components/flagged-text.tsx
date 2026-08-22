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
export function findDivergences(flags: Flag[], backTranslation: string) {
  const haystack = backTranslation.toLowerCase();
  return flags.map((f) => f.term).filter((term) => !haystack.includes(term.toLowerCase()));
}
