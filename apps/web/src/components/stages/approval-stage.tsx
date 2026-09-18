import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaggedText, findDivergences } from "@/components/flagged-text";
import { PipelineStatus, StatusLine } from "@/components/pipeline-status";
import { canApprove, isRtl, languageLabel, type ExtractedItem, type Job } from "@/lib/job";
import { approveJobRequest, jobQueryOptions, recheckJobRequest } from "@/lib/jobs.api";

type Draft = {
  extracted: ExtractedItem[];
  transcription: string;
  plainScript: string;
  translation: string;
};

function draftFromJob(job: Job): Draft {
  return {
    extracted: job.extracted.map((row) => ({ ...row, extra: { ...(row.extra ?? {}) } })),
    transcription: job.transcription ?? "",
    plainScript: job.plainScript,
    translation: job.translation,
  };
}

export function ApprovalStage({ jobId, onApproved }: { jobId: string; onApproved: () => void }) {
  const { data: job, isPending } = useQuery(jobQueryOptions(jobId));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"recheck" | "approve" | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => {
    if (job && job.status === "awaiting_approval" && draft === null) setDraft(draftFromJob(job));
  }, [job, draft]);

  useEffect(() => {
    if (job && (job.status === "synthesizing" || job.status === "done")) onApproved();
  }, [job, onApproved]);

  const dirty = useMemo(() => {
    if (!job || !draft) return false;
    return JSON.stringify(draftFromJob(job)) !== JSON.stringify(draft);
  }, [job, draft]);

  const divergences = useMemo(
    () => (job ? findDivergences(job.flags, job.backTranslation) : []),
    [job],
  );

  if (isPending || !job) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="soft-card p-10">
        <h1 className="text-3xl font-semibold tracking-tight">This prescription didn't process</h1>
        <p className="mt-3 text-muted-foreground">{job.error ?? "The pipeline stopped early."}</p>
      </div>
    );
  }

  if (job.status !== "awaiting_approval" || !draft) {
    return (
      <div className="soft-card p-10">
        <PipelineStatus status={job.status} />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">
          {job.status === "reading" ? "Reading the photo" : "Grounding and translating"}
        </h1>
        <div className="mt-2">
          <StatusLine status={job.status} />
        </div>
        <div className="mt-8 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    );
  }

  const rtl = isRtl(job.targetLanguage);

  async function onRecheck() {
    if (!draft) return;
    setBusy("recheck");
    try {
      await recheckJobRequest(jobId, draft);
      setLastChecked(new Date().toLocaleTimeString());
      setDraft(null);
    } finally {
      setBusy(null);
    }
  }

  async function onApprove() {
    if (!draft) return;
    setBusy("approve");
    try {
      await approveJobRequest(jobId, dirty ? draft : undefined);
      onApproved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Step 2 of 3 · {job.id}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Clinician approval</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            You are approving the <strong>{languageLabel(job.targetLanguage)}</strong> wording the
            patient will hear — not the English draft. Use the back-translation to check the meaning
            survived the round trip.
          </p>
        </div>
        <PipelineStatus status={job.status} />
      </header>

      {job.flags.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-verify bg-verify-surface px-5 py-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-verify-foreground">
            {job.flags.length} term{job.flags.length === 1 ? "" : "s"} to verify
          </span>
          {job.flags.map((flag) => {
            const divergent = divergences.includes(flag.term);
            return (
              <Badge
                key={`${flag.kind}-${flag.term}`}
                variant="outline"
                className={
                  divergent
                    ? "rounded-full border-divergence bg-background text-divergence-foreground"
                    : "rounded-full border-verify bg-background text-verify-foreground"
                }
              >
                <span className="font-mono">{flag.term}</span>
                <span className="mx-1.5 opacity-50">·</span>
                {flag.kind}
                <span className="mx-1.5 opacity-50">·</span>
                {flag.confidence.toFixed(2)}
                {divergent && <span className="ml-1.5 font-semibold">check back-translation</span>}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Photo on the left, what was read from it on the right */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="soft-card self-start overflow-hidden lg:sticky lg:top-6">
          <h2 className="border-b border-panel-border px-6 py-4 text-sm font-semibold uppercase tracking-wide">
            Prescription photo
          </h2>
          {job.sourceImageUrl ? (
            <div className="p-4">
              <img
                src={job.sourceImageUrl}
                alt="Captured prescription photo"
                className="soft-inset max-h-[30rem] w-full object-contain"
              />
              <p className="mt-3 px-2 font-mono text-xs text-muted-foreground">
                Stored with job {job.id} · never re-read after editing
              </p>
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">No photo stored for this job.</p>
          )}
        </div>

        <div className="space-y-6">
          <Panel
            title="What was read from the prescription"
            hint="The full transcription — edit anything that was misread or missed."
          >
            <Textarea
              value={draft.transcription}
              onChange={(e) => setDraft((d) => (d ? { ...d, transcription: e.target.value } : d))}
              className="min-h-52 resize-y rounded-xl bg-background text-base leading-relaxed"
            />
          </Panel>

          <Panel
            title="Structured medicines"
            hint="Key fields the video and dosing instructions are built from."
          >
            <div className="space-y-5">
              {draft.extracted.map((row, index) => (
                <div key={index} className="soft-inset space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-1 rounded-full brand-gradient" />
                    <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Medicine {index + 1}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Drug"
                      value={row.drug}
                      onChange={(v) => updateRow(setDraft, index, { drug: v })}
                    />
                    <Field
                      label="Dose"
                      value={row.dose}
                      onChange={(v) => updateRow(setDraft, index, { dose: v })}
                    />
                    <Field
                      label="Frequency"
                      value={row.freq}
                      onChange={(v) => updateRow(setDraft, index, { freq: v })}
                    />
                    <Field
                      label="Days"
                      value={String(row.days)}
                      onChange={(v) => updateRow(setDraft, index, { days: Number(v) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      Directions & notes
                    </Label>
                    <Textarea
                      value={row.notes ?? ""}
                      placeholder="How the patient should take it, warnings, what to do if a dose is missed…"
                      onChange={(e) => updateRow(setDraft, index, { notes: e.target.value })}
                      className="min-h-24 resize-y rounded-xl bg-background text-base leading-relaxed"
                    />
                  </div>
                  {row.extra && Object.keys(row.extra).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(row.extra).map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                        >
                          <span className="font-mono uppercase tracking-wide opacity-70">
                            {key}
                          </span>
                          <span className="mx-1.5 opacity-40">·</span>
                          <span className="font-medium">{value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Plain-language script (English)"
            hint="What the presenter says, before translation."
          >
            <Textarea
              value={draft.plainScript}
              onChange={(e) => setDraft((d) => (d ? { ...d, plainScript: e.target.value } : d))}
              className="min-h-40 resize-y rounded-xl bg-background text-lg leading-relaxed"
            />
            <FlaggedText
              text={draft.plainScript}
              flags={job.flags}
              className="mt-3 text-sm text-muted-foreground"
            />
          </Panel>
        </div>
      </div>

      {/* Translation handoff arrow */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full brand-gradient text-primary-foreground shadow-md">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 4v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Translated into {languageLabel(job.targetLanguage)}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title={`Translation — ${languageLabel(job.targetLanguage)}`}
          hint="Exactly what the patient will hear and read."
        >
          <Textarea
            dir={rtl ? "rtl" : "ltr"}
            value={draft.translation}
            onChange={(e) => setDraft((d) => (d ? { ...d, translation: e.target.value } : d))}
            className="min-h-44 resize-y rounded-xl bg-background text-xl"
          />
        </Panel>

        <Panel
          title="Back-translation (English)"
          hint="The translation turned back into English so you can check the meaning."
          tone={divergences.length > 0 ? "warn" : "plain"}
        >
          <FlaggedText
            text={job.backTranslation}
            flags={job.flags}
            divergentTerms={divergences}
            className="text-lg leading-relaxed"
          />
          {divergences.length > 0 && (
            <p className="mt-4 rounded-xl border border-divergence bg-divergence-surface px-4 py-3 text-sm text-divergence-foreground">
              These terms may not have survived the round trip:{" "}
              <span className="font-mono font-semibold">{divergences.join(", ")}</span>. Edit the
              translation and re-check before approving.
            </p>
          )}
        </Panel>
      </div>

      <footer className="sticky bottom-0 mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-panel-border bg-background/85 py-5 backdrop-blur">
        <div className="text-sm text-muted-foreground">
          {busy === "recheck" ? (
            <span className="font-medium">Re-grounding your edits…</span>
          ) : busy === "approve" ? (
            <span className="font-medium">Approving and queueing the video…</span>
          ) : dirty ? (
            <span className="font-medium text-verify-foreground">
              Unsaved edits — re-check to re-ground the edited content.
            </span>
          ) : lastChecked ? (
            <span>Re-checked at {lastChecked}. Photo was not re-read.</span>
          ) : (
            <span>Edit any field inline; the photo is never re-read.</span>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="h-13 rounded-full px-6 text-base"
            onClick={onRecheck}
            disabled={!dirty || busy !== null}
          >
            {busy === "recheck" ? "Re-checking…" : "Re-check edits"}
          </Button>
          <Button
            size="lg"
            className="h-13 rounded-full border-0 px-8 text-base text-primary-foreground brand-gradient shadow-lg hover:opacity-90"
            onClick={onApprove}
            disabled={!canApprove(job) || busy !== null}
          >
            {busy === "approve" ? "Approving…" : "Approve & generate video"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function updateRow(
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>,
  index: number,
  patch: Partial<ExtractedItem>,
) {
  setDraft((d) => {
    if (!d) return d;
    return {
      ...d,
      extracted: d.extracted.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    };
  });
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl bg-background text-base font-medium"
      />
    </div>
  );
}

function Panel({
  title,
  hint,
  tone = "plain",
  children,
}: {
  title: string;
  hint: string;
  tone?: "plain" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className={tone === "warn" ? "soft-card border-2 border-verify" : "soft-card"}>
      <div className="border-b border-panel-border px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
