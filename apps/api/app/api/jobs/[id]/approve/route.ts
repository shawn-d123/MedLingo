import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { runPostApprovalPipeline } from "@/lib/pipeline/run";
import { applyEdits } from "@/lib/prepipeline/run";
import type { EditedFields } from "@/lib/types";

/**
 * The clinician's approve action. Body may carry { editedFields } when the
 * clinician edited on the approval screen and approved in one tap — those
 * edits are applied AND re-verified (fresh back-translation + flags) BEFORE
 * approvedAt is set. Edits never dodge the safety check, and nothing is
 * approved that wasn't verified in the exact form that will be spoken.
 *
 * Then Person C's pipeline fires. Direct call from the route handler is
 * deliberate — a 9-hour build does not need a job queue.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });

  if (job.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Job ${id} is "${job.status}", not "awaiting_approval" — nothing to approve.` },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { editedFields?: EditedFields };
  if (body.editedFields) {
    try {
      await applyEdits(id, body.editedFields);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Edits could not be verified: ${message}` }, { status: 422 });
    }
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
