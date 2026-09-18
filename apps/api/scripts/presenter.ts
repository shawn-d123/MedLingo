// Generate presenter image(s) with Fal image gen.
//   npm run presenter -- both         (ur + pl, per-language — default)
//   npm run presenter -- ur | pl      (one language's presenter)
//   npm run presenter -- illustrated  (flat cartoon, shared across languages)
// Every presenter is a fully generated SYNTHETIC person — we never clone or
// imitate any real clinician, and the video is labelled AI on screen.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { falClient, withFalFailover, withTimeout } from "../lib/pipeline/util";
import { download } from "./helpers";

const BASE =
  "Professional studio portrait photograph, front-facing head-and-shoulders, gentle approachable " +
  "smile, wearing plain teal medical scrubs, soft even studio lighting, plain light blue-grey " +
  "background, looking directly at the camera, photorealistic, sharp focus on the face, natural " +
  "skin texture, 85mm lens look. ";

interface Variant {
  model: string;
  prompt: string;
  envKey: string;
  file: string;
}

const VARIANTS: Record<string, Variant> = {
  ur: {
    model: "fal-ai/flux/dev",
    prompt: BASE + "A warm, friendly South Asian woman healthcare presenter in her mid-30s, dark hair tied back.",
    envKey: "PRESENTER_IMAGE_URL_UR",
    file: "public/presenter-ur.png",
  },
  pl: {
    model: "fal-ai/flux/dev",
    prompt: BASE + "A warm, friendly European woman healthcare presenter in her mid-30s, light brown hair tied back.",
    envKey: "PRESENTER_IMAGE_URL_PL",
    file: "public/presenter-pl.png",
  },
  illustrated: {
    model: "fal-ai/flux/schnell",
    prompt:
      "Friendly illustrated healthcare presenter, front-facing head-and-shoulders portrait, warm " +
      "approachable smile, flat vector illustration style, clean bold outlines, soft pastel " +
      "medical-blue background, clearly a drawn cartoon character (not photorealistic), " +
      "gender-neutral, wearing a plain teal medical tunic, centered, looking at camera",
    envKey: "PRESENTER_IMAGE_URL",
    file: "public/presenter-illustrated.png",
  },
};

function setEnvVar(key: string, value: string) {
  const envPath = ".env.local";
  let env = readFileSync(envPath, "utf8");
  const line = new RegExp(`^#?\\s*${key}=.*$`, "m");
  if (line.test(env)) env = env.replace(line, `${key}=${value}`);
  else env += `\n${key}=${value}\n`;
  writeFileSync(envPath, env, "utf8");
}

async function generate(name: string, v: Variant) {
  const fal = falClient();
  console.log(`Generating "${name}" presenter (${v.model})...`);
  const result = await withTimeout(
    withFalFailover("image generation", () =>
      fal.subscribe(v.model, { input: { prompt: v.prompt, image_size: "portrait_4_3", num_images: 1 } })
    ),
    180_000,
    "Fal image generation"
  );
  const url = (result.data as { images?: { url?: string }[] })?.images?.[0]?.url;
  if (!url) throw new Error(`No image url in response for "${name}"`);
  const bytes = await download(url, v.file);
  setEnvVar(v.envKey, url);
  console.log(`  Saved ${v.file} (${(bytes / 1024).toFixed(0)} KB) -> ${v.envKey} set in .env.local`);
}

async function main() {
  const arg = (process.argv[2] ?? "both").toLowerCase();
  const names = arg === "both" ? ["ur", "pl"] : [arg];
  for (const name of names) {
    const v = VARIANTS[name];
    if (!v) {
      console.error(`Unknown variant "${name}" — use: both | ${Object.keys(VARIANTS).join(" | ")}`);
      process.exit(1);
    }
    await generate(name, v);
  }
  console.log("Done — restart `npm run dev` to pick up the new env.");
}

main().catch((err) => {
  console.error("presenter generation failed:", err.message ?? err);
  process.exit(1);
});
