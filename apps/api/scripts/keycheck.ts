// Pre-demo sanity check: which API keys are actually alive right now?
//   npm run keycheck
import "./env";
import { fal } from "@fal-ai/client";

async function checkFalKey(name: string, key: string) {
  fal.config({ credentials: key });
  try {
    await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
      input: { text: "Checking this key.", voice: "Rachel", language_code: "en" },
    });
    console.log(`  ${name}: OK`);
    return true;
  } catch (err) {
    const e = err as { status?: number; message?: string; body?: unknown };
    console.log(`  ${name}: FAILED (status=${e.status} ${e.message}) ${JSON.stringify(e.body ?? "").slice(0, 140)}`);
    return false;
  }
}

async function main() {
  console.log("Fal keys (TTS probe):");
  const falSlots: [string, string | undefined][] = [
    ["FAL_KEY  ", process.env.FAL_KEY],
    ["FAL_KEY_2", process.env.FAL_KEY_2],
    ["FAL_KEY_3", process.env.FAL_KEY_3],
  ];
  let anyFal = false;
  for (const [name, key] of falSlots) {
    if (!key) continue;
    if (await checkFalKey(name, key)) anyFal = true;
  }

  console.log("\nTavily keys:");
  for (const [name, key] of [
    ["TAVILY_API_KEY  ", process.env.TAVILY_API_KEY],
    ["TAVILY_API_KEY_2", process.env.TAVILY_API_KEY_2],
  ] as [string, string | undefined][]) {
    if (!key) continue;
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: "amoxicillin patient information leaflet", max_results: 1 }),
    });
    console.log(`  ${name}: ${r.ok ? "OK" : `FAILED (HTTP ${r.status})`}`);
  }

  console.log("\nOpenAI:");
  const oa = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  console.log(`  OPENAI_API_KEY: ${oa.ok ? "OK" : `FAILED (HTTP ${oa.status})`}`);

  if (!anyFal) {
    console.log("\nNO WORKING FAL KEY — voice and video cannot run. Play the backups/ files.");
    process.exit(1);
  }
}

main();
