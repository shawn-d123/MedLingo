import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { runPostApprovalPipeline } from "@/lib/pipeline/run";

/**
 * The clinician's approve action. Sets approvedAt, then fires Person C's
 * pipeline. Direct call from the route handler is deliberate — a 9-hour build
 * does not need a job queue. The pipeline updates the job as it goes, so A's
 * polling GET reflects progress.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });

  if (job.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Job ${id} is "${job.status}", not "awaiting_approval" — nothing to approve.` },
      { status: 409 }
    );
  }

  const approved = updateJob(id, { approvedAt: new Date().toISOString(), status: "synthesizing" });

  // Fire and don't await — the poll loop watches progress. Failures are
  // written onto the job by the pipeline itself, never swallowed.
  runPostApprovalPipeline(id).catch((err) => {
    console.error(`[approve] pipeline crashed for ${id}:`, err);
    try {
      updateJob(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    } catch {}
  });

  return NextResponse.json(approved, { status: 202 });
}
