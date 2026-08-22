import { createFileRoute } from "@tanstack/react-router";
import { getJobImage } from "@/lib/job-store.server";

/**
 * Stable handoff URL for the captured photo: GET /api/jobs/:id/image
 * Returns the raw JPEG/PNG bytes so any downstream step (OCR / extraction)
 * can read the image without touching the frontend.
 */
export const Route = createFileRoute("/api/jobs/$id/image")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const image = getJobImage(params.id);
        if (!image) return Response.json({ error: "no image for this job" }, { status: 404 });
        return new Response(new Uint8Array(image.bytes), {
          headers: {
            "content-type": image.contentType,
            "cache-control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
