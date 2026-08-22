import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs, updateJob } from "@/lib/store";
import { runPreApprovalPipeline } from "@/lib/prepipeline/run";

export async function GET() {
  return NextResponse.json(listJobs());
}

// Person A: POST here from the capture view. Body: { sourceImageUrl | imageBase64,
// targetLanguage } — the image as a data URL (what the camera/file input produces)
// or an https URL. If present, Person B's chain fires immediately; the poll loop
// on GET /api/jobs/:id watches it walk reading -> grounding -> awaiting_approval.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.imageBase64 && !body.sourceImageUrl) {
    body.sourceImageUrl = String(body.imageBase64).startsWith("data:")
      ? body.imageBase64
      : `data:image/jpeg;base64,${body.imageBase64}`;
    delete body.imageBase64;
  }
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
