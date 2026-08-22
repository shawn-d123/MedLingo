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
cp .env.example .env.local   # then fill in the keys
npm run presenter            # one-time: generates the illustrated presenter image
npm run dev                  # http://localhost:3000/dev is the pipeline test harness
```

## The full journey (verified end-to-end over HTTP)

`POST /api/jobs` with a photo → **B's chain**: extract (OpenAI vision) → strip PII →
structure (Pioneer, optional) → plain script → ground (Tavily) → translate + back-translate
+ flags → `awaiting_approval` → **clinician taps approve** → **C's chain**: speech (Fal
ElevenLabs v3, OpenAI fallback) → VEED Fabric 1.0 lip-sync → subtitles → `done`.

## The job object — the one shared contract

Defined in [`lib/types.ts`](lib/types.ts), stored in-memory by [`lib/store.ts`](lib/store.ts)
(seeded demo jobs: `job_ur_demo`, `job_pl_demo`). **Nobody changes this shape without telling
the other two.**

## API surface

| Route | Who calls it | What it does |
| --- | --- | --- |
| `POST /api/jobs` | A (capture view) | Create job with `sourceImageUrl` (data URL fine) + `targetLanguage`; fires B's chain |
| `GET /api/jobs/:id` | A (poll ~2s) | Current job state |
| `PATCH /api/jobs/:id` | B | Write pre-gate fields. `approvedAt`/`audioUrl`/`outputVideoUrl` rejected by design |
| `POST /api/jobs/:id/recheck` | A (edit path) | Clinician edited the script: re-translate + re-verify, back to `awaiting_approval` — never restarts from the photo |
| `POST /api/jobs/:id/approve` | A (approve button) | Sets `approvedAt`, fires C's chain |
| `GET /api/jobs/:id/subtitles` | A (result player `<track>`) | English WebVTT |

## CLI harnesses (test either half without a browser)

```bash
npm run read -- test-images/printed-amoxicillin.png ur   # B: photo -> full job JSON
npm run voice-test                                        # C: Fal vs OpenAI TTS, ur + pl
npm run render-once                                       # C: approved job -> backups/test-ur.mp4
npm run backups                                           # both languages end-to-end -> backups/
```

Test images live in `test-images/` — use the **printed** one for demos; the handwritten one
exists to exercise OCR + PII stripping (it carries a real name).

## Who owns what

- **Person A — frontend**: capture, approval screen, result screen (`app/` pages; `/dev` is a test rig, replace freely).
- **Person B — before the gate**: [`lib/prepipeline/`](lib/prepipeline/) + recheck route. Ends at `awaiting_approval`, never sets `approvedAt`.
- **Person C — after the gate**: [`lib/pipeline/`](lib/pipeline/) + approve route. Writes only `audioUrl`, `outputVideoUrl`, `subtitlesVtt`, `status`, `error`.

**The gate is structural**: C's pipeline throws if `approvedAt` is null; the PATCH route
rejects gate fields; approve rejects jobs not in `awaiting_approval`.

**No cloning, on purpose**: the presenter is an illustrated character, labelled AI-generated
on screen. We deliberately do not clone any real clinician's face or voice.

## Sponsor integration notes (checked live on the day)

- **Fal TTS**: `fal-ai/qwen-3-tts` doesn't exist; real Qwen TTS has no Urdu/Polish. Default
  is `fal-ai/elevenlabs/tts/eleven-v3` (same Fal client/key). Override: `FAL_TTS_ENDPOINT`.
- **VEED Fabric**: `veed/fabric-1.0` on Fal, output at `data.video.url`. Confirmed working.
- **Pioneer**: `/v1/models` lists no GLiNER; use
  `fastino/Fastino-Nemotron-3.5-Lightning-Healthcare` (id pre-filled in `.env.example`).
  Inference needs a payment card on the account (agent.pioneer.ai/billing) or booth credits —
  until then the structuring step skips gracefully and says so in the logs.
- **Tavily**: working; grounding falls back per-drug (never fabricates) and the sheet's own
  return-advice always survives refinement.

## Non-goals (do not build)

No auth, no database, no deployment, no mobile layout, no landing page, no settings screen.
