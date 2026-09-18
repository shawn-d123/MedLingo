const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/jobs",
    body: "{ imageBase64, targetLanguage }",
    summary: "Open a job from a prescription photo and start the reading pipeline.",
  },
  {
    method: "GET",
    path: "/api/jobs/:id",
    summary: "Poll job state. Recovers a finished render that outlived its poll loop.",
  },
  {
    method: "PATCH",
    path: "/api/jobs/:id",
    summary:
      "Write pre-approval fields. approvedAt, audioUrl and outputVideoUrl are rejected here by design.",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/recheck",
    body: "{ editedFields }",
    summary: "Re-translate and re-verify after a clinician edit. Never re-reads the photo.",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/approve",
    body: "{ editedFields? }",
    summary: "The gate. Sets approvedAt, then starts speech and video generation.",
  },
  {
    method: "GET",
    path: "/api/jobs/:id/subtitles",
    summary: "English WebVTT for the result player.",
  },
];

export default function ApiIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 font-sans">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
        MedLingo · pipeline api
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        This is the API, not the clinician app.
      </h1>
      <p className="mt-3 max-w-prose text-neutral-600 dark:text-neutral-400">
        It turns a photographed prescription into a clinician-approved video for the
        patient. The interface lives in the web app on port 8080.
      </p>

      <ul className="mt-10 flex flex-col gap-3">
        {ENDPOINTS.map((e) => (
          <li
            key={`${e.method} ${e.path}`}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-xs font-semibold text-neutral-500">
                {e.method}
              </span>
              <span className="font-mono text-sm font-medium">{e.path}</span>
              {e.body && (
                <span className="font-mono text-xs text-neutral-500">{e.body}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
              {e.summary}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-neutral-500">
        Jobs are held in memory — restarting this server clears them.
      </p>
    </main>
  );
}
