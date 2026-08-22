import { cn } from "@/lib/utils";

export type FlowStage = "onboarding" | "capture" | "approval" | "result";

const STAGES: { key: FlowStage; label: string }[] = [
  { key: "onboarding", label: "Start" },
  { key: "capture", label: "Capture" },
  { key: "approval", label: "Approval" },
  { key: "result", label: "Patient video" },
];

/** Always-visible flow position so the clinician knows where they are. */
export function StageProgress({ stage, busy }: { stage: FlowStage; busy?: boolean }) {
  const current = STAGES.findIndex((s) => s.key === stage);
  const pct = ((current + 1) / STAGES.length) * 100;

  return (
    <div className="soft-card px-5 py-4">
      <ol className="flex items-center gap-2">
        {STAGES.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold transition-colors",
                  state === "done" && "bg-secondary text-secondary-foreground",
                  state === "current" && "brand-gradient text-primary-foreground shadow-md",
                  state === "todo" && "bg-muted text-muted-foreground/70",
                )}
              >
                {state === "done" ? "✓" : String(i + 1)}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  state === "current" ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full brand-gradient transition-[width] duration-500",
            busy && "animate-pulse",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Full-panel loading state used while a stage is handing off to the next one. */
export function StageLoading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="soft-card flex flex-col items-center justify-center gap-4 p-16 text-center">
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
        <span className="h-6 w-6 rounded-full brand-gradient shadow-md" />
      </span>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {detail && <p className="max-w-md text-muted-foreground">{detail}</p>}
    </div>
  );
}
