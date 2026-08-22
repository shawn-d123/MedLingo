// The 13:00 milestone: Fal (ElevenLabs v3) vs OpenAI TTS in both target
// languages. Produces voice-test/{fal,openai}-{ur,pl}.mp3 — find a native
// speaker and let them judge. Swap the loser via TTS_PROVIDER in .env.local.
import "./env";
import { getJob } from "../lib/store";
import { synthesizeFal, synthesizeOpenAI } from "../lib/pipeline/tts";
import { download } from "./helpers";

const LANGS = [
  { code: "ur", name: "Urdu", jobId: "job_ur_demo" },
  { code: "pl", name: "Polish", jobId: "job_pl_demo" },
];

async function main() {
  for (const { code, name, jobId } of LANGS) {
    const text = getJob(jobId)!.translation;
    console.log(`\n=== ${name} (${code}) ===`);
    for (const [label, fn] of [
      ["fal", () => synthesizeFal(text, code)],
      ["openai", () => synthesizeOpenAI(text, code)],
    ] as const) {
      try {
        const speech = await fn();
        const out = `voice-test/${label}-${code}.mp3`;
        const bytes = await download(speech.audioUrl, out);
        console.log(`  ${label}: OK -> ${out} (${(bytes / 1024).toFixed(0)} KB, voice=${speech.voice})`);
      } catch (err) {
        console.log(`  ${label}: FAILED -> ${(err as Error).message}`);
      }
    }
  }
  console.log("\nListen to the files in voice-test/ — ideally with a native speaker judging.");
}

main();
