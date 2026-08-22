import "dotenv/config";
import {
  extractFromImage,
  stripPii,
  structureCleanup,
  writePlainScript,
  groundAndRefine,
  translateAndVerify,
  ALLOWED_LANGUAGES,
} from "./lib/pipeline.js";

function newJob(sourceImageUrl, targetLanguage) {
  return {
    id: `job_${Date.now()}`,
    status: "reading",
    sourceImageUrl,
    targetLanguage,
    extracted: [],
    plainScript: null,
    translation: null,
    backTranslation: null,
    flags: [],
    approvedAt: null,
    audioUrl: null,
    outputVideoUrl: null,
    error: null,
  };
}

async function main() {
  const [, , imagePath, targetLanguage] = process.argv;

  if (!imagePath || !targetLanguage) {
    console.error("Usage: node run.js <path-to-prescription-photo> <language-code>");
    console.error(`Allowed language codes: ${Object.keys(ALLOWED_LANGUAGES).join(", ")}`);
    process.exit(1);
  }

  const job = newJob(imagePath, targetLanguage);
  const started = Date.now();

  try {
    // STEP 1 — Extract
    job.status = "reading";
    console.log("[1/6] Extracting from image...");
    const raw = await extractFromImage(imagePath);

    // STEP 2 — Strip PII (immediately, before anything moves onward)
    console.log("[2/6] Stripping PII...");
    job.extracted = stripPii(raw);

    // STEP 3 — Structure cleanup (Pioneer/GLiNER, best-effort)
    console.log("[3/6] Structuring via Pioneer (if configured)...");
    job.extracted = await structureCleanup(job.extracted);
    job.status = "grounding";

    // STEP 4 — Plain-language script
    console.log("[4/6] Writing plain-language script...");
    let plainScript = await writePlainScript(job.extracted);

    // STEP 5 — Ground with Tavily, refine script
    console.log("[5/6] Grounding with Tavily...");
    const grounded = await groundAndRefine(job.extracted, plainScript);
    job.plainScript = grounded.plainScript;

    // STEP 6 — Translate + back-translate + flags
    console.log("[6/6] Translating and verifying...");
    const { translation, backTranslation, flags } = await translateAndVerify(
      job.plainScript,
      job.targetLanguage
    );
    job.translation = translation;
    job.backTranslation = backTranslation;
    job.flags = flags;

    // STEP 7 — Hand off
    job.status = "awaiting_approval";

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s. Job object:\n`);
    console.log(JSON.stringify(job, null, 2));
  } catch (err) {
    job.status = "failed";
    job.error = err.message;
    console.error(`\nPipeline failed at status "${job.status}": ${err.message}\n`);
    console.log(JSON.stringify(job, null, 2));
    process.exit(1);
  }
}

main();
