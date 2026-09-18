import { STATUS_COPY, type JobStatus } from "@/lib/job";
import { cn } from "@/lib/utils";

const ORDER: JobStatus[] = [
  "reading",
  "grounding",
  "awaiting_approval",
  "synthesizing",
  "done",
];

const SHORT: Record<JobStatus, string> = {
  reading: "Read photo",
  grounding: "Ground & translate",
  awaiting_approval: "Clinician approval",
  synthesizing: "Generate video",
  done: "Ready for patient",
  failed: "Failed",
};

export function PipelineStatus({ status }: { status: JobStatus }) {
  const current = ORDER.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {ORDER.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={step} className="flex items-center gap-3">
            <span
              className={cn(
                "flex items-center gap-2 rounded-sm border px-2.5 py-1 font-medium tracking-tight",
                state === "done" && "border-border bg-secondary text-muted-foreground",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "todo" && "border-border/70 bg-transparent text-muted-foreground/70",
              )}
            >
              <span className="font-mono text-xs">{String(i + 1).padStart(2, "0")}</span>
              {SHORT[step]}
            </span>
            {i < ORDER.length - 1 && <span className="text-border">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function StatusLine({ status }: { status: JobStatus }) {
  return (
    <p className="text-base text-muted-foreground">
      {STATUS_COPY[status]}
      {status !== "done" && status !== "failed" && status !== "awaiting_approval" && (
        <span className="ml-1 inline-flex gap-0.5 font-mono">
          <span className="animate-pulse">.</span>
          <span className="animate-pulse [animation-delay:150ms]">.</span>
          <span className="animate-pulse [animation-delay:300ms]">.</span>
        </span>
      )}
    </p>
  );
}
