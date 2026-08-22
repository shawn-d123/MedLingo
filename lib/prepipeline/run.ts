import { getJob, updateJob } from "../store";
import {
  extractFromImage,
  stripPii,
  scrubText,
  structureCleanup,
  writePlainScript,
  groundAndRefine,
  translateAndVerify,
  verifyTranslation,
} from "./steps";
import type { EditedFields, Job } from "../types";

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
    const transcription = scrubText(raw.transcription ?? "");
    updateJob(jobId, { extracted, transcription });
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
 * Apply clinician edits from A's approval screen, re-verifying whatever the
 * edits touched. Used by BOTH /recheck and /approve (approve-with-edits):
 * an edited script or translation is never carried forward without a fresh
 * back-translation and fresh flags — edits must not dodge the safety check.
 */
export async function applyEdits(jobId: string, edited: EditedFields): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);

  // Verbatim fields first — no downstream consequences.
  const verbatim: Partial<Job> = {};
  if (edited.extracted) verbatim.extracted = edited.extracted;
  if (edited.transcription !== undefined) verbatim.transcription = edited.transcription;
  if (Object.keys(verbatim).length > 0) updateJob(jobId, verbatim);

  const scriptChanged =
    edited.plainScript !== undefined && edited.plainScript.trim() !== job.plainScript.trim();
  const translationChanged =
    edited.translation !== undefined && edited.translation.trim() !== job.translation.trim();

  if (scriptChanged && !translationChanged) {
    // New English script -> full re-translate + verify.
    const plainScript = edited.plainScript!.trim();
    updateJob(jobId, { plainScript });
    const result = await translateAndVerify(plainScript, job.targetLanguage);
    return updateJob(jobId, { ...result });
  }

  if (translationChanged) {
    // Clinician touched the target-language text itself (possibly the script
    // too) — verify exactly what will be spoken.
    const plainScript = scriptChanged ? edited.plainScript!.trim() : job.plainScript;
    const translation = edited.translation!.trim();
    updateJob(jobId, { plainScript, translation });
    const result = await verifyTranslation(plainScript, translation, job.targetLanguage);
    return updateJob(jobId, { ...result });
  }

  return getJob(jobId)!;
}

/**
 * Edit-and-recheck: the clinician edited fields on the approval screen instead
 * of approving. Re-enters the chain at translation/verification — never
 * restarts from the photo — and returns the job to awaiting_approval.
 */
export async function recheckJob(jobId: string, edited: EditedFields): Promise<Job> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  if (job.approvedAt) throw new Error(`Job ${jobId} is already approved — nothing to re-check.`);

  try {
    updateJob(jobId, { status: "grounding", error: null });
    await applyEdits(jobId, edited);

    // If the edits didn't change script or translation, still refresh the
    // round trip so the clinician gets a current verification to sign off.
    const current = getJob(jobId)!;
    if (!current.backTranslation || (!edited.plainScript && !edited.translation)) {
      const result = await verifyTranslation(current.plainScript, current.translation, current.targetLanguage);
      updateJob(jobId, { ...result });
    }

    return updateJob(jobId, { status: "awaiting_approval" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prepipeline] recheck ${jobId} FAILED: ${message}`);
    return updateJob(jobId, { status: "failed", error: message });
  }
}
