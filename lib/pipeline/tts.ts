import OpenAI from "openai";
import { falClient, withFalFailover, withTimeout, mockMode, sleep } from "./util";

const TTS_TIMEOUT_MS = 120_000;

// Endpoint choice, checked live on the day: the primer's "fal-ai/qwen-3-tts"
// slug doesn't exist, and the real Qwen endpoint's language list has neither
// Urdu nor Polish. ElevenLabs v3 on Fal covers both — same client, same key.
const DEFAULT_FAL_ENDPOINT = "fal-ai/elevenlabs/tts/eleven-v3";
const DEFAULT_FAL_VOICE = "Rachel";

export interface SpeechResult {
  audioUrl: string;
  provider: "fal" | "openai" | "mock";
  voice: string;
}

// One interface, two implementations — if one provider's voice quality in a
// target language is poor, swap via TTS_PROVIDER without touching callers.
export async function synthesize(text: string, lang: string): Promise<SpeechResult> {
  if (mockMode()) {
    await sleep(1000);
    return { audioUrl: "https://example.com/mock-audio.mp3", provider: "mock", voice: "mock" };
  }

  if (process.env.TTS_PROVIDER === "openai") return synthesizeOpenAI(text, lang);

  try {
    return await synthesizeFal(text, lang);
  } catch (err) {
    console.warn(`[tts] Fal TTS failed (${(err as Error).message}) — falling back to OpenAI`);
    return synthesizeOpenAI(text, lang);
  }
}

export async function synthesizeFal(text: string, lang: string): Promise<SpeechResult> {
  const fal = falClient();
  const endpoint = process.env.FAL_TTS_ENDPOINT ?? DEFAULT_FAL_ENDPOINT;
  const voice = process.env.FAL_TTS_VOICE ?? DEFAULT_FAL_VOICE;

  // ElevenLabs endpoints take an ISO 639-1 language_code; other endpoints
  // (e.g. Qwen) reject unknown fields, so only send it where it's valid.
  const input: Record<string, unknown> = { text, voice };
  if (endpoint.includes("elevenlabs")) input.language_code = lang;

  const result = await withTimeout(
    withFalFailover(`TTS (${endpoint})`, () =>
      fal.subscribe(endpoint, { input } as Parameters<typeof fal.subscribe>[1])
    ),
    TTS_TIMEOUT_MS,
    `Fal TTS (${endpoint})`
  );

  const data = result.data as { audio?: { url?: string } };
  const url = data?.audio?.url;
  if (!url) throw new Error(`Fal TTS returned no audio url (keys: ${Object.keys(data ?? {}).join(", ")})`);
  return { audioUrl: url, provider: "fal", voice };
}

export async function synthesizeOpenAI(text: string, lang: string): Promise<SpeechResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (see .env.example)");
  const openai = new OpenAI();
  const voice = process.env.OPENAI_TTS_VOICE ?? "nova";

  const langName: Record<string, string> = { ur: "Urdu", pl: "Polish", en: "English" };
  const response = await withTimeout(
    openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
      instructions: `Speak clearly and calmly in ${langName[lang] ?? lang}, at a measured pace, like a friendly healthcare presenter explaining medication instructions to a patient.`,
    }),
    TTS_TIMEOUT_MS,
    "OpenAI TTS"
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  // Fabric needs a hosted URL, so push the mp3 into Fal storage (same account).
  const fal = falClient();
  const file = new File([new Uint8Array(buffer)], `tts-${lang}-${Date.now()}.mp3`, { type: "audio/mpeg" });
  const url = await withTimeout(
    withFalFailover("storage upload", () => fal.storage.upload(file)),
    60_000,
    "Fal storage upload"
  );
  return { audioUrl: url, provider: "openai", voice };
}
