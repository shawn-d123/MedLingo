import { fal } from "@fal-ai/client";

let configured = false;
export function falClient() {
  if (!configured) {
    if (!process.env.FAL_KEY) throw new Error("FAL_KEY is not set (see .env.example)");
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
  return fal;
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
