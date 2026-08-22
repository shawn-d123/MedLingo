import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store";
import { recheckJob } from "@/lib/prepipeline/run";

/**
 * Edit-and-recheck: Person A's approval screen calls this when the clinician
 * edits the plain-language script instead of approving as-is. Re-translates
 * and re-verifies from the edited script — never restarts from the photo.
 * Body (optional): { plainScript: "edited text" }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });
  if (job.approvedAt) {
    return NextResponse.json({ error: `Job ${id} is already approved — nothing to re-check.` }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { plainScript?: string };

  recheckJob(id, body.plainScript).catch((err) => {
    console.error(`[recheck] crashed for ${id}:`, err);
  });

  return NextResponse.json(getJob(id), { status: 202 });
}
