import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store";
import { recheckJob } from "@/lib/prepipeline/run";
import type { EditedFields } from "@/lib/types";

/**
 * Edit-and-recheck: Person A's approval screen calls this when the clinician
 * edits fields instead of approving as-is. Re-translates / re-verifies from
 * the edited content — never restarts from the photo — and returns the job
 * to awaiting_approval. Body: { editedFields: {...} } (A's shape), or the
 * legacy { plainScript } shortcut.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });
  if (job.approvedAt) {
    return NextResponse.json({ error: `Job ${id} is already approved — nothing to re-check.` }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    editedFields?: EditedFields;
    plainScript?: string;
  };
  const edited: EditedFields = body.editedFields ?? (body.plainScript ? { plainScript: body.plainScript } : {});

  recheckJob(id, edited).catch((err) => {
    console.error(`[recheck] crashed for ${id}:`, err);
  });

  return NextResponse.json(getJob(id), { status: 202 });
}
