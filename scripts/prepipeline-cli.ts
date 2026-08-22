// Person B's CLI harness (successor to run.js — same usage, same output):
//   npm run read -- test-images/printed-amoxicillin.png ur
// Photo in, full job object JSON out, no server involved.
import "./env";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createJob, getJob } from "../lib/store";
import { runPreApprovalPipeline } from "../lib/prepipeline/run";
import { ALLOWED_LANGUAGES } from "../lib/prepipeline/steps";

function toDataUrl(imagePath: string): string {
  const mime = extname(imagePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;
}

async function main() {
  const [, , imagePath, targetLanguage] = process.argv;
  if (!imagePath || !targetLanguage) {
    console.error("Usage: npm run read -- <path-to-prescription-photo> <language-code>");
    console.error(`Allowed language codes: ${Object.keys(ALLOWED_LANGUAGES).join(", ")}`);
    process.exit(1);
  }

  const job = createJob({
    id: `job_cli_${Date.now().toString(36)}`,
    sourceImageUrl: toDataUrl(imagePath),
    targetLanguage,
    status: "reading",
  });

  const started = Date.now();
  const result = await runPreApprovalPipeline(job.id);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const printable = { ...getJob(job.id)!, sourceImageUrl: `<${imagePath}>`, subtitlesVtt: undefined };
  console.log(`\n${result.status === "failed" ? "FAILED" : "Done"} in ${elapsed}s. Job object:\n`);
  console.log(JSON.stringify(printable, null, 2));
  if (result.status === "failed") process.exit(1);
}

main();
