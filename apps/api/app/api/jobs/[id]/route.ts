import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { recoverVideo } from "@/lib/pipeline/video";
import type { Job } from "@/lib/types";

// Don't hit Fal on every 2s poll — one recovery check per job per 10s.
const lastRecoveryCheck = new Map<string, number>();
const RECOVERY_THROTTLE_MS = 10_000;

/**
 * If a Fabric render outlived our poll loop (timeout, restart, dropped
 * connection), the video still exists on Fal — collect it here so the
 * frontend's own polling heals the job instead of showing a dead spinner.
 */
async function tryRecover(job: Job): Promise<Job> {
  const stalled = job.status === "synthesizing" || job.status === "failed";
  if (!stalled || job.outputVideoUrl || !job.falRequestId) return job;

  const last = lastRecoveryCheck.get(job.id) ?? 0;
  if (Date.now() - last < RECOVERY_THROTTLE_MS) return job;
  lastRecoveryCheck.set(job.id, Date.now());

  const url = await recoverVideo(job.falRequestId);
  if (!url) return job;

  console.log(`[jobs] recovered finished video for ${job.id} (request ${job.falRequestId})`);
  return updateJob(job.id, { outputVideoUrl: url, status: "done", error: null });
}

// Person A polls this every ~2s and renders whichever state comes back.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: `Unknown job: ${id}` }, { status: 404 });
  return NextResponse.json(await tryRecover(job));
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
