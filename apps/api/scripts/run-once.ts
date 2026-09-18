// The "text in, playing subtitled MP4 out" test — no server involved.
// Uses the seeded Urdu job with approvedAt hardcoded, exactly as the primer
// says: never wait on Person B's pipeline to test Person C's half.
import "./env";
import { getJob, updateJob } from "../lib/store";
import { runPostApprovalPipeline } from "../lib/pipeline/run";
import { download, saveText } from "./helpers";

async function main() {
  const jobId = process.argv[2] ?? "job_ur_demo";
  const job = getJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId} (seeded: job_ur_demo, job_pl_demo)`);

  // Hardcoded approval for the CLI test — the gate check in the pipeline still
  // runs; we satisfy it explicitly rather than bypassing it.
  updateJob(jobId, { approvedAt: new Date().toISOString() });

  console.log(`Running pipeline for ${jobId} (${job.targetLanguage})...`);
  const started = Date.now();
  const result = await runPostApprovalPipeline(jobId);
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  if (result.status !== "done" || !result.outputVideoUrl) {
    throw new Error(`Pipeline ended "${result.status}" after ${secs}s: ${result.error}`);
  }

  console.log(`Done in ${secs}s. Video: ${result.outputVideoUrl}`);
  const out = `backups/test-${job.targetLanguage}.mp4`;
  const bytes = await download(result.outputVideoUrl, out);
  if (result.subtitlesVtt) saveText(result.subtitlesVtt, `backups/test-${job.targetLanguage}.vtt`);
  console.log(`Saved ${out} (${(bytes / 1024 / 1024).toFixed(1)} MB) + subtitles. Open it and watch it.`);
}

main().catch((err) => {
  console.error("run-once failed:", err.message ?? err);
  process.exit(1);
});
