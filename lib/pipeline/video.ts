import { falClient, withTimeout, mockMode, sleep } from "./util";

const VIDEO_TIMEOUT_MS = 420_000;

// VEED Fabric 1.0, hosted on Fal — same SDK and key as the TTS call.
// Presenter is a deliberately illustrated character (no cloning of any real
// clinician's face or voice — stated design decision, out of scope to change).
export async function renderVideo(presenterImageUrl: string, audioUrl: string): Promise<string> {
  if (mockMode()) {
    await sleep(2000);
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  }

  const fal = falClient();
  const result = await withTimeout(
    fal.subscribe("veed/fabric-1.0", {
      input: {
        image_url: presenterImageUrl,
        audio_url: audioUrl,
        resolution: (process.env.VIDEO_RESOLUTION === "720p" ? "720p" : "480p") as "480p" | "720p",
      },
    }),
    VIDEO_TIMEOUT_MS,
    "VEED Fabric 1.0"
  );

  // Primer says video.data.video.url but says to check — so probe a few shapes.
  const data = result.data as Record<string, unknown>;
  const url =
    (data?.video as { url?: string } | undefined)?.url ??
    (data?.output as { url?: string } | undefined)?.url ??
    (typeof data?.video_url === "string" ? data.video_url : undefined) ??
    (typeof data?.url === "string" ? data.url : undefined);

  if (!url) {
    throw new Error(`Fabric returned no video url (response keys: ${Object.keys(data ?? {}).join(", ")})`);
  }
  return url;
}

// Per-language presenter when configured (PRESENTER_IMAGE_URL_UR / _PL),
// falling back to the shared PRESENTER_IMAGE_URL.
export function presenterImageUrl(lang?: string): string {
  const perLang = lang ? process.env[`PRESENTER_IMAGE_URL_${lang.toUpperCase()}`] : undefined;
  const url = perLang ?? process.env.PRESENTER_IMAGE_URL;
  if (!url) {
    throw new Error(
      "PRESENTER_IMAGE_URL is not set — run `npm run presenter -- both` to generate presenters, then restart the server"
    );
  }
  return url;
}
