import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs, updateJob } from "@/lib/store";
import { runPreApprovalPipeline } from "@/lib/prepipeline/run";

export async function GET() {
  return NextResponse.json(listJobs());
}

// Person A: POST here from the capture view. Body: { sourceImageUrl, targetLanguage }.
// sourceImageUrl can be a data URL (what the frontend camera/file input produces)
// or an https URL. If present, Person B's chain fires immediately; the poll loop
// on GET /api/jobs/:id watches it walk reading -> grounding -> awaiting_approval.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const job = createJob(body);

  if (job.sourceImageUrl && job.status === "reading") {
    runPreApprovalPipeline(job.id).catch((err) => {
      console.error(`[jobs] prepipeline crashed for ${job.id}:`, err);
      try {
        updateJob(job.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
      } catch {}
    });
  }

  return NextResponse.json(job, { status: 201 });
}
