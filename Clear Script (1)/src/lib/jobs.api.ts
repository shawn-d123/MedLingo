import type { EditedFields, Job } from "./job";

/**
 * Single place where the frontend talks to the backend.
 * VITE_USE_MOCK=true (default) hits the in-repo mock routes; flip it to false
 * once B and C's real routes are live — no component code changes.
 */
const USE_MOCK = (import.meta.env["VITE_USE_MOCK"] ?? "true") !== "false";
const BASE = USE_MOCK ? "/api/jobs" : (import.meta.env["VITE_API_BASE"] ?? "/api/jobs");

export const usingMock = USE_MOCK;

/** Base URL for job endpoints not wrapped here (e.g. `${jobsApiBase}/${id}/subtitles`). */
export const jobsApiBase = BASE;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function createJobRequest(input: {
  imageBase64: string;
  targetLanguage: string;
}): Promise<{ id: string; status: string }> {
  return json(
    await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchJob(id: string): Promise<Job> {
  return json(await fetch(`${BASE}/${id}`));
}

export async function recheckJobRequest(id: string, editedFields: EditedFields): Promise<Job> {
  return json(
    await fetch(`${BASE}/${id}/recheck`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ editedFields }),
    }),
  );
}

export async function approveJobRequest(id: string, editedFields?: EditedFields): Promise<Job> {
  return json(
    await fetch(`${BASE}/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editedFields ? { editedFields } : {}),
    }),
  );
}

export const jobQueryOptions = (id: string) => ({
  queryKey: ["job", id] as const,
  queryFn: () => fetchJob(id),
  refetchInterval: (query: { state: { data: Job | undefined } }) => {
    const status = query.state.data?.status;
    return status === "done" || status === "failed" ? false : 2000;
  },
  // Keep polling even when the tab is backgrounded — a clinician switching
  // apps mid-pipeline should come back to a current screen, not a stale one.
  refetchIntervalInBackground: true,
});
