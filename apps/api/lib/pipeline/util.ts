import { fal } from "@fal-ai/client";

// Fal keys are tried in order (FAL_KEY, FAL_KEY_2, FAL_KEY_3). When the
// active key comes back exhausted/locked mid-call, withFalFailover rolls to
// the next one and retries — running out of credit on stage must cost one
// log line, not the demo.
function falKeys(): string[] {
  return [process.env.FAL_KEY, process.env.FAL_KEY_2, process.env.FAL_KEY_3].filter(
    (k): k is string => Boolean(k)
  );
}

let keyIndex = -1;

export function falClient() {
  if (keyIndex === -1) {
    const keys = falKeys();
    if (keys.length === 0) throw new Error("FAL_KEY is not set (see .env.example)");
    keyIndex = 0;
    fal.config({ credentials: keys[0] });
  }
  return fal;
}

function keyExhausted(err: unknown): boolean {
  const e = err as { message?: string; status?: number; body?: unknown };
  const text = `${e?.message ?? ""} ${JSON.stringify(e?.body ?? "")}`.toLowerCase();
  return (
    e?.status === 401 ||
    e?.status === 402 ||
    e?.status === 403 ||
    /locked|top_up|balance|exhausted|quota|payment|unauthorized/.test(text)
  );
}

export async function withFalFailover<T>(label: string, run: () => Promise<T>): Promise<T> {
  falClient();
  const keys = falKeys();
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (keyExhausted(err) && keyIndex < keys.length - 1) {
        keyIndex += 1;
        console.warn(
          `[fal] key ${keyIndex + 1}/${keys.length} taking over for ${label} — previous key exhausted/locked`
        );
        fal.config({ credentials: keys[keyIndex] });
        continue;
      }
      throw err;
    }
  }
}

// Every external call goes through this — a hung sponsor API must surface as a
// failed job, never a spinner that spins forever on stage.
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export const mockMode = () => process.env.MOCK_PIPELINE === "1";

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
