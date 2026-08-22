// One-time: generate the illustrated presenter with Fal image gen.
// Deliberately ILLUSTRATED (clearly drawn, not photoreal) — a stated design
// decision, not a limitation. No cloning of any real clinician's face.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { falClient, withTimeout } from "../lib/pipeline/util";
import { download } from "./helpers";

const PROMPT =
  "Friendly illustrated healthcare presenter, front-facing head-and-shoulders portrait, " +
  "warm approachable smile, flat vector illustration style, clean bold outlines, soft pastel " +
  "medical-blue background, clearly a drawn cartoon character (not photorealistic), " +
  "gender-neutral, wearing a plain teal medical tunic, centered, looking at camera";

async function main() {
  const fal = falClient();
  console.log("Generating illustrated presenter (fal-ai/flux/schnell)...");
  const result = await withTimeout(
    fal.subscribe("fal-ai/flux/schnell", {
      input: { prompt: PROMPT, image_size: "portrait_4_3", num_images: 1 },
    }),
    120_000,
    "Fal image generation"
  );

  const data = result.data as { images?: { url?: string }[] };
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error(`No image url in response (keys: ${Object.keys(data ?? {}).join(", ")})`);

  const bytes = await download(url, "public/presenter.png");
  console.log(`Saved public/presenter.png (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`Hosted URL: ${url}`);

  // Write PRESENTER_IMAGE_URL into .env.local so the pipeline picks it up.
  const envPath = ".env.local";
  let env = readFileSync(envPath, "utf8");
  if (/^#?\s*PRESENTER_IMAGE_URL=.*$/m.test(env)) {
    env = env.replace(/^#?\s*PRESENTER_IMAGE_URL=.*$/m, `PRESENTER_IMAGE_URL=${url}`);
  } else {
    env += `\nPRESENTER_IMAGE_URL=${url}\n`;
  }
  writeFileSync(envPath, env, "utf8");
  console.log("PRESENTER_IMAGE_URL written to .env.local — restart `npm run dev` to pick it up.");
}

main().catch((err) => {
  console.error("presenter generation failed:", err.message ?? err);
  process.exit(1);
});
