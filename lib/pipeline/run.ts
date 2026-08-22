import { getJob, updateJob } from "../store";
import { synthesize } from "./tts";
import { renderVideo, presenterImageUrl } from "./video";
import { buildVtt } from "./subtitles";
import type { Job } from "../types";

/**
 * Person C's pipeline: approved translation -> speech -> lip-synced video -> subtitles.
 *
 * SAFETY REQUIREMENT, not just good practice: this refuses to run unless
 * `approvedAt` is set. Nothing reaches a patient unreviewed — including the
 * video this generates. The clinician's approval tap is the gate, and this
 * check is what makes the gate structural rather than a UI convention.
 */
export async function runPostApprovalPipeline(jobId: string): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);

  if (!job.approvedAt) {
    throw new Error(
      `Refusing to synthesize for job ${jobId}: approvedAt is not set. ` +
        `No audio or video is ever generated before a clinician approves the translation.`
    );
  }
  if (!job.translation?.trim()) {
    throw new Error(`Job ${jobId} has no approved translation text to speak.`);
  }

  updateJob(jobId, { status: "synthesizing", error: null });

  try {
    // Step 2 — speech from the APPROVED translation, in the target language
    const speech = await synthesize(job.translation, job.targetLanguage);
    updateJob(jobId, { audioUrl: speech.audioUrl });
    console.log(`[pipeline] ${jobId}: audio ready (${speech.provider}/${speech.voice})`);

    // Step 4 (cheap, do it while video renders conceptually) — English subtitles
    const subtitlesVtt = buildVtt(job.plainScript);
    updateJob(jobId, { subtitlesVtt });

    // Step 3 — VEED Fabric: synthetic presenter + audio -> lip-synced video.
    // The request id is stored the moment it's queued, so if this call times
    // out the finished render can still be collected (see recoverVideo).
    const videoUrl = await renderVideo(
      presenterImageUrl(job.targetLanguage),
      speech.audioUrl,
      (requestId) => updateJob(jobId, { falRequestId: requestId })
    );
    console.log(`[pipeline] ${jobId}: video ready`);

    // Step 5 — finish
    return updateJob(jobId, { outputVideoUrl: videoUrl, status: "done" });
  } catch (err) {
    // Never leave the job hanging — A's UI needs something to render.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] ${jobId} FAILED: ${message}`);
    return updateJob(jobId, { status: "failed", error: message });
  }
}
