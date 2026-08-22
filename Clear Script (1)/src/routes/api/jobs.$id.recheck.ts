import { createFileRoute } from "@tanstack/react-router";
import { recheckJob } from "@/lib/job-store.server";
import type { EditedFields } from "@/lib/job";

export const Route = createFileRoute("/api/jobs/$id/recheck")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const body = (await request.json()) as { editedFields?: EditedFields };
        const job = recheckJob(params.id, body.editedFields ?? {});
        if (!job) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(job);
      },
    },
  },
});
