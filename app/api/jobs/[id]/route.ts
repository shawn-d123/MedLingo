import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import type { Job } from "@/lib/types";

// Person A polls this every ~2s and renders whichever state comes back.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });
  return NextResponse.json(job);
}

// Person B writes extraction/translation results through this.
// Gate-protected fields are rejected: approvedAt only ever comes from the
// approve endpoint, and audioUrl/outputVideoUrl only from Person C's pipeline.
const PATCHABLE: (keyof Job)[] = [
  "status",
  "sourceImageUrl",
  "targetLanguage",
  "extracted",
  "transcription",
  "plainScript",
  "translation",
  "backTranslation",
  "flags",
  "error",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJob(id)) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Partial<Job>;
  const rejected = Object.keys(body).filter((k) => !PATCHABLE.includes(k as keyof Job));
  if (rejected.length > 0) {
    return NextResponse.json(
      { error: `Fields not patchable here: ${rejected.join(", ")} (approvedAt is set only by POST /approve; audio/video only by the pipeline)` },
      { status: 400 }
    );
  }

  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => PATCHABLE.includes(k as keyof Job)));
  const job = updateJob(id, patch as Partial<Job>);
  return NextResponse.json(job);
}
