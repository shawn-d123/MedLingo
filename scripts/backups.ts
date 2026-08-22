// The 16:30 insurance policy: render BOTH demo languages end to end and keep
// the MP4s locally. If a live run stalls on conference wifi at 20:00, play
// these and nobody watching learns anything went wrong.
import "./env";
import { getJob, updateJob } from "../lib/store";
import { runPostApprovalPipeline } from "../lib/pipeline/run";
import { download, saveText } from "./helpers";

async function renderBackup(jobId: string): Promise<string> {
  const job = getJob(jobId)!;
  updateJob(jobId, { approvedAt: new Date().toISOString() });
  console.log(`\n[${jobId}] rendering (${job.targetLanguage})...`);
  const result = await runPostApprovalPipeline(jobId);
  if (result.status !== "done" || !result.outputVideoUrl) {
    throw new Error(`[${jobId}] ended "${result.status}": ${result.error}`);
  }
  const out = `backups/backup-${job.targetLanguage}.mp4`;
  const bytes = await download(result.outputVideoUrl, out);
  if (result.subtitlesVtt) saveText(result.subtitlesVtt, `backups/backup-${job.targetLanguage}.vtt`);
  return `${out} (${(bytes / 1024 / 1024).toFixed(1)} MB)`;
}

async function main() {
  const results: string[] = [];
  let failed = false;
  for (const jobId of ["job_ur_demo", "job_pl_demo"]) {
    try {
      results.push(await renderBackup(jobId));
    } catch (err) {
      failed = true;
      results.push(`FAILED: ${(err as Error).message}`);
    }
  }
  console.log("\n=== Backup render results ===");
  for (const r of results) console.log("  " + r);
  console.log("\nNow WATCH BOTH files before calling this done.");
  if (failed) process.exit(1);
}

main();
