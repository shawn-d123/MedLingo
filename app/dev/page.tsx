"use client";

// Person C's test harness — NOT the product UI (that's Person A's).
// Approve a seeded job, watch the status walk awaiting_approval ->
// synthesizing -> done, then play the result with English subtitles.

import { useEffect, useState } from "react";
import type { Job } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  awaiting_approval: "bg-amber-100 text-amber-800",
  synthesizing: "bg-blue-100 text-blue-800 animate-pulse",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function DevHarness() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok) setJobs(await res.json());
      } catch {}
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/jobs/${id}/approve`, { method: "POST" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="text-2xl font-bold">MedLingo — Person C dev harness</h1>
      <p className="mt-1 text-sm text-gray-500">
        Voice &amp; video pipeline test rig. Approving a job here is the same call Person A&apos;s
        approve button makes: <code>POST /api/jobs/:id/approve</code>.
      </p>

      <div className="mt-6 space-y-6">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-gray-300 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-sm font-semibold">{job.id}</span>
                <span className="ml-2 text-xs text-gray-500">lang: {job.targetLanguage}</span>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[job.status] ?? "bg-gray-100 text-gray-700"}`}>
                {job.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-gray-600 line-clamp-2">{job.plainScript}</p>

            {job.status === "awaiting_approval" && (
              <button
                onClick={() => approve(job.id)}
                disabled={busy === job.id}
                className="mt-4 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {busy === job.id ? "Approving…" : "Approve (fires C's pipeline)"}
              </button>
            )}

            {job.status === "synthesizing" && (
              <p className="mt-4 text-sm text-blue-700">
                Generating {job.audioUrl ? "video (audio done)" : "speech"}… this takes ~1–3 min live.
              </p>
            )}

            {job.status === "failed" && (
              <p className="mt-4 rounded bg-red-50 p-3 font-mono text-xs text-red-700">{job.error}</p>
            )}

            {job.status === "done" && job.outputVideoUrl && (
              <div className="relative mt-4">
                <video controls className="w-full rounded-md" src={job.outputVideoUrl}>
                  <track
                    default
                    kind="subtitles"
                    srcLang="en"
                    label="English"
                    src={`/api/jobs/${job.id}/subtitles`}
                  />
                </video>
                <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  AI-generated presenter
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
