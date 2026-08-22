// One-time: generate the presenter image with Fal image gen.
//   npm run presenter -- realistic    (photoreal SYNTHETIC person — default)
//   npm run presenter -- illustrated  (flat cartoon character)
// Either way: a generated person who exists nowhere — we never clone or
// imitate any real clinician's face, and the video is labelled AI on screen.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { falClient, withTimeout } from "../lib/pipeline/util";
import { download } from "./helpers";

const STYLES: Record<string, { model: string; prompt: string }> = {
  realistic: {
    model: "fal-ai/flux/dev",
    prompt:
      "Professional studio portrait photograph of a warm, friendly healthcare presenter in her mid-30s, " +
      "front-facing head-and-shoulders, gentle approachable smile, wearing plain teal medical scrubs, " +
      "soft even studio lighting, plain light blue-grey background, looking directly at the camera, " +
      "photorealistic, sharp focus on the face, natural skin texture, 85mm lens look",
  },
  illustrated: {
    model: "fal-ai/flux/schnell",
    prompt:
      "Friendly illustrated healthcare presenter, front-facing head-and-shoulders portrait, " +
      "warm approachable smile, flat vector illustration style, clean bold outlines, soft pastel " +
      "medical-blue background, clearly a drawn cartoon character (not photorealistic), " +
      "gender-neutral, wearing a plain teal medical tunic, centered, looking at camera",
  },
};

async function main() {
  const style = (process.argv[2] ?? "realistic").toLowerCase();
  const config = STYLES[style];
  if (!config) {
    console.error(`Unknown style "${style}" — use: ${Object.keys(STYLES).join(" | ")}`);
    process.exit(1);
  }

  const fal = falClient();
  console.log(`Generating ${style} presenter (${config.model})...`);
  const result = await withTimeout(
    fal.subscribe(config.model, {
      input: { prompt: config.prompt, image_size: "portrait_4_3", num_images: 1 },
    }),
    180_000,
    "Fal image generation"
  );

  const data = result.data as { images?: { url?: string }[] };
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error(`No image url in response (keys: ${Object.keys(data ?? {}).join(", ")})`);

  const localPath = `public/presenter-${style}.png`;
  const bytes = await download(url, localPath);
  console.log(`Saved ${localPath} (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`Hosted URL: ${url}`);

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
