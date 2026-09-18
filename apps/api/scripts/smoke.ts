/**
 * End-to-end smoke test with no API keys and no network.
 *   npm run smoke
 *
 * Drives a job through the full state machine and asserts the parts that
 * matter: PII never survives extraction, the approval gate cannot be
 * bypassed, edits force re-verification, and a job reaches `done` with a
 * video and subtitles. Exits non-zero on the first failure.
 */
process.env.MOCK_PIPELINE = "1";

import { createJob, getJob, updateJob } from "../lib/store";
import { runPreApprovalPipeline, recheckJob } from "../lib/prepipeline/run";
import { runPostApprovalPipeline } from "../lib/pipeline/run";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("MedLingo smoke test (MOCK_PIPELINE=1, no keys required)\n");

  // --- the reading half -----------------------------------------------------
  console.log("reading pipeline");
  const job = createJob({
    id: "job_smoke",
    sourceImageUrl: "data:image/png;base64,mock",
    targetLanguage: "ur",
    status: "reading",
  });

  const read = await runPreApprovalPipeline(job.id);
  check("reaches awaiting_approval", read.status === "awaiting_approval", read.error ?? read.status);
  check("extracts at least one medication", read.extracted.length > 0);
  check("writes a plain-language script", read.plainScript.trim().length > 0);
  check("produces translation and back-translation",
    read.translation.trim().length > 0 && read.backTranslation.trim().length > 0);
  check("flags safety-critical terms", read.flags.length > 0);
  check("leaves the gate closed", read.approvedAt === null);

  const serialized = JSON.stringify({ ...read, sourceImageUrl: "" }).toLowerCase();
  const leaks = ["sachin", "rahman", "943 476", "d'souza"].filter((t) => serialized.includes(t));
  check("no patient or clinician identity in the job", leaks.length === 0, leaks.join(", "));

  // --- the gate -------------------------------------------------------------
  console.log("\napproval gate");
  const unapproved = createJob({
    id: "job_smoke_gate",
    targetLanguage: "ur",
    translation: "x",
    status: "awaiting_approval",
  });
  let refused = false;
  try {
    await runPostApprovalPipeline(unapproved.id);
  } catch {
    refused = true;
  }
  const gateJob = getJob(unapproved.id)!;
  check("synthesis refuses to run before approval",
    refused || gateJob.status === "failed", `status=${gateJob.status}`);
  check("no audio or video produced for an unapproved job",
    !gateJob.audioUrl && !gateJob.outputVideoUrl);

  // --- edit and re-check ----------------------------------------------------
  console.log("\nedit and re-check");
  const editedScript = `${read.plainScript} Do not take it if you are allergic to penicillin.`;
  const rechecked = await recheckJob(job.id, { plainScript: editedScript });
  check("returns to awaiting_approval after an edit",
    rechecked.status === "awaiting_approval", rechecked.error ?? rechecked.status);
  check("keeps the edited script", rechecked.plainScript === editedScript);
  check("re-verifies after the edit", rechecked.backTranslation.trim().length > 0);
  check("still gated after re-check", rechecked.approvedAt === null);

  // --- the generating half --------------------------------------------------
  console.log("\ngeneration");
  updateJob(job.id, { approvedAt: new Date().toISOString() });
  const done = await runPostApprovalPipeline(job.id);
  check("reaches done", done.status === "done", done.error ?? done.status);
  check("produces audio", Boolean(done.audioUrl));
  check("produces a video", Boolean(done.outputVideoUrl));
  check("produces subtitles", Boolean(done.subtitlesVtt?.startsWith("WEBVTT")));

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});
