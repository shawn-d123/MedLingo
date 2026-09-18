import { falClient, withFalFailover, withTimeout, mockMode, sleep } from "./util";

// Fabric render time scales with audio length. A multi-medication script can
// run to 2+ minutes of speech, so the ceiling has to be generous — but the
// real defence is capping script length (see writePlainScript).
const VIDEO_TIMEOUT_MS = Number(process.env.VIDEO_TIMEOUT_MS ?? 900_000);
const POLL_INTERVAL_MS = 3_000;
const FABRIC_ENDPOINT = "veed/fabric-1.0";

function fabricInput(presenterImageUrl: string, audioUrl: string) {
  return {
    image_url: presenterImageUrl,
    audio_url: audioUrl,
    resolution: (process.env.VIDEO_RESOLUTION === "720p" ? "720p" : "480p") as "480p" | "720p",
  };
}

function extractVideoUrl(data: unknown): string | null {
  const d = data as Record<string, unknown> | undefined;
  return (
    (d?.video as { url?: string } | undefined)?.url ??
    (d?.output as { url?: string } | undefined)?.url ??
    (typeof d?.video_url === "string" ? d.video_url : undefined) ??
    (typeof d?.url === "string" ? d.url : undefined) ??
    null
  );
}

/**
 * VEED Fabric 1.0, hosted on Fal — same SDK and key as the TTS call.
 * Presenter is a deliberately synthetic character (no cloning of any real
 * clinician's face or voice — stated design decision, out of scope to change).
 *
 * Submitted through the QUEUE rather than fal.subscribe: subscribe abandons
 * the request when our timeout fires, but Fal keeps rendering — so a slow
 * video was being produced and then thrown away. Holding the request id means
 * a render is always recoverable (see recoverVideo).
 */
export async function renderVideo(
  presenterImageUrl: string,
  audioUrl: string,
  onEnqueue?: (requestId: string) => void
): Promise<string> {
  if (mockMode()) {
    await sleep(2000);
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  }

  const fal = falClient();

  const queued = await withFalFailover("VEED Fabric submit", () =>
    fal.queue.submit(FABRIC_ENDPOINT, { input: fabricInput(presenterImageUrl, audioUrl) })
  );
  const requestId = queued.request_id;
  console.log(`[pipeline] Fabric request queued: ${requestId}`);
  onEnqueue?.(requestId);

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > VIDEO_TIMEOUT_MS) {
      throw new Error(
        `VEED Fabric still rendering after ${Math.round(VIDEO_TIMEOUT_MS / 1000)}s ` +
          `(request ${requestId}) — it may finish shortly; the job will pick it up.`
      );
    }
    await sleep(POLL_INTERVAL_MS);

    const status = await withTimeout(
      fal.queue.status(FABRIC_ENDPOINT, { requestId }),
      60_000,
      "Fabric status check"
    );
    if (status.status !== "COMPLETED") continue;

    const result = await withTimeout(
      fal.queue.result(FABRIC_ENDPOINT, { requestId }),
      120_000,
      "Fabric result fetch"
    );
    const url = extractVideoUrl(result.data);
    if (!url) {
      throw new Error(
        `Fabric returned no video url (response keys: ${Object.keys((result.data as object) ?? {}).join(", ")})`
      );
    }
    return url;
  }
}

/**
 * Re-attach to a Fabric render we already submitted. Used when a job timed
 * out (or the poll loop died) but Fal carried on and finished — the video
 * exists, we just stopped listening. Returns the URL if it's ready now.
 */
export async function recoverVideo(requestId: string): Promise<string | null> {
  if (mockMode()) return null;
  const fal = falClient();
  try {
    const status = await withTimeout(
      fal.queue.status(FABRIC_ENDPOINT, { requestId }),
      30_000,
      "Fabric recovery status"
    );
    if (status.status !== "COMPLETED") return null;
    const result = await withTimeout(
      fal.queue.result(FABRIC_ENDPOINT, { requestId }),
      120_000,
      "Fabric recovery result"
    );
    return extractVideoUrl(result.data);
  } catch (err) {
    console.warn(`[pipeline] recovery check failed for ${requestId}: ${(err as Error).message}`);
    return null;
  }
}

// Per-language presenter when configured (PRESENTER_IMAGE_URL_UR / _PL),
// falling back to the shared PRESENTER_IMAGE_URL.
export function presenterImageUrl(lang?: string): string {
  const perLang = lang ? process.env[`PRESENTER_IMAGE_URL_${lang.toUpperCase()}`] : undefined;
  const url = perLang ?? process.env.PRESENTER_IMAGE_URL;
  // Evaluated as an argument to renderVideo, so it must not throw before the
  // mock branch inside renderVideo is reached.
  if (!url && mockMode()) return "mock://presenter";
  if (!url) {
    throw new Error(
      "PRESENTER_IMAGE_URL is not set — run `npm run presenter -- both` to generate presenters, then restart the server"
    );
  }
  return url;
}
