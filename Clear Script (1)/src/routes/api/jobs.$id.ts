import { createFileRoute } from "@tanstack/react-router";
import { getJob } from "@/lib/job-store.server";

export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const job = getJob(params.id);
        if (!job) return Response.json({ error: "not found" }, { status: 404 });
        return Response.json(job);
      },
    },
  },
});
