import { getJob, updateJob } from "../store";
import {
  extractFromImage,
  stripPii,
  structureCleanup,
  writePlainScript,
  groundAndRefine,
  translateAndVerify,
} from "./steps";
import type { Job } from "../types";

/**
 * Person B's chain: photo -> extract -> strip PII -> structure -> plain script
 * -> ground -> translate + back-translate + flags -> awaiting_approval. STOPS
 * there: approvedAt belongs to the clinician's tap, audio/video to Person C.
 */
export async function runPreApprovalPipeline(jobId: string): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (!job.sourceImageUrl) throw new Error(`Job ${jobId} has no sourceImageUrl to read.`);

  try {
    updateJob(jobId, { status: "reading", error: null });

    const raw = await extractFromImage(job.sourceImageUrl);
    let extracted = stripPii(raw); // PII gone before anything else moves
    extracted = await structureCleanup(extracted);
    updateJob(jobId, { extracted });
    console.log(`[prepipeline] ${jobId}: extracted ${extracted.length} medication(s)`);

    updateJob(jobId, { status: "grounding" });
    const draft = await writePlainScript(extracted);
    const { plainScript } = await groundAndRefine(extracted, draft);
    updateJob(jobId, { plainScript });
    console.log(`[prepipeline] ${jobId}: plain script ready (${plainScript.split(/\s+/).length} words)`);

    const { translation, backTranslation, flags } = await translateAndVerify(plainScript, job.targetLanguage);
    console.log(`[prepipeline] ${jobId}: translation + back-translation ready, ${flags.length} flag(s)`);

    // Hand off — and stop. The next transition is the clinician's.
    return updateJob(jobId, { translation, backTranslation, flags, status: "awaiting_approval" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prepipeline] ${jobId} FAILED: ${message}`);
    return updateJob(jobId, { status: "failed", error: message });
  }
}

/**
 * Edit-and-recheck: the clinician edited plainScript on the approval screen
 * instead of approving. Re-enters the chain at translation — never restarts
 * from the photo — and returns the job to awaiting_approval.
 */
export async function recheckJob(jobId: string, editedPlainScript?: string): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.approvedAt) throw new Error(`Job ${jobId} is already approved — nothing to re-check.`);

  const plainScript = editedPlainScript?.trim() || job.plainScript;
  if (!plainScript) throw new Error(`Job ${jobId} has no plainScript to re-check.`);

  try {
    updateJob(jobId, { status: "grounding", plainScript, error: null });
    const { translation, backTranslation, flags } = await translateAndVerify(plainScript, job.targetLanguage);
    return updateJob(jobId, { translation, backTranslation, flags, status: "awaiting_approval" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prepipeline] recheck ${jobId} FAILED: ${message}`);
    return updateJob(jobId, { status: "failed", error: message });
  }
}
