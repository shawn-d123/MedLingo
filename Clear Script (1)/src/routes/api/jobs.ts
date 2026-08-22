import { createFileRoute } from "@tanstack/react-router";
import { createJob } from "@/lib/job-store.server";

export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          imageBase64?: string;
          targetLanguage?: string;
        };
        if (!body.targetLanguage) {
          return Response.json({ error: "targetLanguage is required" }, { status: 400 });
        }
        const created = createJob({
          ...(body.imageBase64 ? { imageBase64: body.imageBase64 } : {}),
          targetLanguage: body.targetLanguage,
        });
        return Response.json(created, { status: 201 });
      },
    },
  },
});
