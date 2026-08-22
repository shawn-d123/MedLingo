import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineStatus, StatusLine } from "@/components/pipeline-status";
import { isRtl, languageLabel } from "@/lib/job";
import { jobQueryOptions } from "@/lib/jobs.api";

export function ResultStage({ jobId, onRestart }: { jobId: string; onRestart: () => void }) {
  const { data: job, isPending } = useQuery(jobQueryOptions(jobId));

  if (isPending || !job) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }

  const rtl = isRtl(job.targetLanguage);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Step 3 of 3 · {job.id}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {job.status === "done" ? "Ready for the patient" : "Generating the video"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {languageLabel(job.targetLanguage)} · approved
            {job.approvedAt ? ` ${new Date(job.approvedAt).toLocaleTimeString()}` : ""} · subtitles
            burned in
          </p>
        </div>
        <PipelineStatus status={job.status} />
      </header>

      <section className="soft-card mt-8 overflow-hidden p-4">
        {job.status === "done" && job.outputVideoUrl ? (
          <video
            key={job.outputVideoUrl}
            src={job.outputVideoUrl}
            controls
            autoPlay
            playsInline
            className="aspect-video w-full rounded-xl bg-foreground"
          />
        ) : (
          <div className="soft-inset flex aspect-video w-full flex-col items-center justify-center gap-4">
            <StatusLine status={job.status} />
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Voice and video are generated from the approved translation only.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="soft-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            What the patient hears — {languageLabel(job.targetLanguage)}
          </h2>
          <p dir={rtl ? "rtl" : "ltr"} className="mt-3 text-xl leading-relaxed">
            {job.translation}
          </p>
        </div>
        <div className="soft-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Approved prescription</h2>
          <table className="mt-3 w-full text-left text-base">
            <thead>
              <tr className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2">Drug</th>
                <th className="pb-2">Dose</th>
                <th className="pb-2">Freq</th>
                <th className="pb-2">Days</th>
              </tr>
            </thead>
            <tbody>
              {job.extracted.map((row, i) => (
                <tr key={i} className="border-t border-panel-border">
                  <td className="py-2 font-medium">{row.drug}</td>
                  <td className="py-2">{row.dose}</td>
                  <td className="py-2">{row.freq}</td>
                  <td className="py-2">{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 flex justify-center">
        <Button
          size="lg"
          variant="outline"
          className="h-13 rounded-full px-8 text-base"
          onClick={onRestart}
        >
          Start another prescription
        </Button>
      </div>
    </div>
  );
}
