import { createFileRoute } from "@tanstack/react-router";
import { approveJob } from "@/lib/job-store.server";
import type { EditedFields } from "@/lib/job";

export const Route = createFileRoute("/api/jobs/$id/approve")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let edited: EditedFields | undefined;
        try {
          const body = (await request.json()) as { editedFields?: EditedFields };
          edited = body.editedFields;
        } catch {
          edited = undefined;
        }
        const job = approveJob(params.id, edited);
        if (!job) {
          return Response.json(
            { error: "job not found, or translation/back-translation missing" },
            { status: 409 },
          );
        }
        return Response.json(job);
      },
    },
  },
});
