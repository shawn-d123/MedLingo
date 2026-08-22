# MedLingo ("Take-Home")

A clinician photographs a prescription or discharge sheet; the patient walks out with a short
video on their phone — an **illustrated presenter** explaining what to actually do, in the
patient's own language, lip-synced and subtitled. A clinician **approves everything first**;
nothing reaches a patient unreviewed.

Built at {Tech: Europe} × VEED, Summer Lock-In. Stack: Next.js (App Router) + Tailwind,
one repo, API routes, in-memory job store. Demo from localhost.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in FAL_KEY and OPENAI_API_KEY
npm run presenter            # one-time: generates the illustrated presenter image
npm run dev                  # http://localhost:3000/dev is Person C's test harness
```

## The job object — the one shared contract

Defined in [`lib/types.ts`](lib/types.ts), stored in-memory by [`lib/store.ts`](lib/store.ts)
(two seeded demo jobs: `job_ur_demo`, `job_pl_demo`). **Nobody changes this shape without
telling the other two.** One addition since the original sketch: optional `subtitlesVtt`
(written by C, served at `GET /api/jobs/:id/subtitles`).

## API surface

| Route | Who calls it | What it does |
| --- | --- | --- |
| `POST /api/jobs` | A (capture view) | Create a job (photo + language) |
| `GET /api/jobs/:id` | A (poll ~2s) | Current job state |
| `PATCH /api/jobs/:id` | B | Write extraction/translation fields. `approvedAt`, `audioUrl`, `outputVideoUrl` are rejected here by design |
| `POST /api/jobs/:id/approve` | A (approve button) | Sets `approvedAt`, fires C's pipeline |
| `GET /api/jobs/:id/subtitles` | A (result player `<track>`) | English WebVTT |

## Who owns what

- **Person A — frontend**: capture, approval screen, result screen (`app/` pages; `/dev` is C's rig, replace freely).
- **Person B — before the gate**: extraction, PII strip, translation, back-translation, grounding. Writes via `PATCH`, ends at `status: "awaiting_approval"`.
- **Person C — after the gate**: `lib/pipeline/*` + the approve route. Speech (Fal TTS, OpenAI fallback) → VEED Fabric 1.0 video (via Fal) → subtitles. Writes only `audioUrl`, `outputVideoUrl`, `subtitlesVtt`, `status`, `error`.

**The gate is structural**: `runPostApprovalPipeline` throws if `approvedAt` is null
([`lib/pipeline/run.ts`](lib/pipeline/run.ts)). This is a safety requirement — no audio or
video is ever generated before a clinician approves the translation.

**No cloning, on purpose**: the presenter is an illustrated character, labelled AI-generated
on screen. We deliberately do not clone any real clinician's face or voice.

## Person C scripts

```bash
npm run voice-test    # Fal vs OpenAI TTS in Urdu + Polish -> voice-test/*.mp3 (native speaker judges)
npm run render-once   # hardcoded approved job -> full pipeline -> backups/test-ur.mp4
npm run backups       # 16:30 insurance: both languages end-to-end -> backups/backup-{ur,pl}.mp4
```

`MOCK_PIPELINE=1` in `.env.local` makes the pipeline return stub URLs after a short delay —
lets Person A build/polish UI states without keys, credits, or network.

## Non-goals (do not build)

No auth, no database, no deployment, no mobile layout, no landing page, no settings screen.
