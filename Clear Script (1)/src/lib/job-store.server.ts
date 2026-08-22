import type { EditedFields, Job } from "./job";

/**
 * In-memory job store for the hackathon demo. No database on purpose.
 * Person B writes everything before the approval gate, Person C everything after.
 * This module only exists so Person A's frontend has something to poll.
 */
const jobs = new Map<string, Job & { createdAt: number; approvedAtMs: number | null }>();

let counter = 0;

const PLAIN_SCRIPT =
  "Take one capsule three times a day with food, for seven days. " +
  "Do not stop early even if you feel better — finish all 21 capsules. " +
  "If you develop a rash, swelling of the face or lips, or trouble breathing, " +
  "stop the capsules and go to A&E straight away.";

const TRANSLATION_UR =
  "کھانے کے ساتھ دن میں تین بار ایک کیپسول لیں، سات دن تک۔ " +
  "طبیعت بہتر ہونے پر بھی دوا بند نہ کریں — تمام اکیس کیپسول مکمل کریں۔ " +
  "اگر جسم پر خارش یا دانے نکلیں، چہرے یا ہونٹوں پر سوجن ہو، یا سانس لینے میں دشواری ہو " +
  "تو کیپسول بند کر دیں اور فوراً ہسپتال کے ایمرجنسی شعبے میں جائیں۔";

const TRANSLATION_PL =
  "Przyjmuj jedną kapsułkę trzy razy dziennie podczas jedzenia, przez siedem dni. " +
  "Nie przerywaj leczenia wcześniej, nawet jeśli poczujesz się lepiej — przyjmij wszystkie 21 kapsułek. " +
  "Jeśli pojawi się wysypka, obrzęk twarzy lub ust albo trudności w oddychaniu, " +
  "przerwij przyjmowanie kapsułek i natychmiast zgłoś się na pogotowie.";

const BACK_TRANSLATION =
  "Take one capsule of amoxicillin, 500mg, three times daily with food for seven days. " +
  "Do not stop the medicine when you feel better — complete all twenty-one capsules. " +
  "If you get itching or a rash, swelling of the face or lips, or difficulty breathing, " +
  "stop the capsules and go immediately to the hospital emergency department.";

function fixture(id: string, targetLanguage: string, sourceImageUrl: string): Job {
  return {
    id,
    status: "reading",
    sourceImageUrl,
    targetLanguage,
    extracted: [
      {
        drug: "Amoxicillin",
        dose: "500mg",
        freq: "Three times a day (TDS)",
        days: 7,
        notes:
          "One capsule with food, morning, afternoon and evening. Finish the full course of 21 capsules even if symptoms settle.",
        extra: { Route: "Oral", Quantity: "21 capsules", Refills: "None" },
      },
      {
        drug: "Paracetamol",
        dose: "500mg",
        freq: "Up to four times a day, as needed",
        days: 5,
        notes:
          "For pain or fever only. Leave at least four hours between doses and never exceed 8 tablets in 24 hours.",
        extra: { Route: "Oral", Quantity: "20 tablets", "Max daily": "4g" },
      },
    ],
    transcription:
      "Dr A. Whitfield · Northfield Medical Centre · 14 Aug 2026\n\n" +
      "1. Amoxicillin 500mg capsules — take ONE capsule THREE times a day with food for 7 days (21 capsules). Complete the course.\n" +
      "2. Paracetamol 500mg tablets — take ONE to TWO tablets up to four times a day when required for pain or fever (max 8 tablets in 24 hours).\n\n" +
      "Allergy note: penicillin allergy not recorded. Stop the antibiotic and seek urgent care if a rash, facial swelling or breathing difficulty develops.\n" +
      "Review in 7 days if symptoms have not improved.",
    plainScript: PLAIN_SCRIPT,
    translation: targetLanguage === "pl" ? TRANSLATION_PL : TRANSLATION_UR,
    backTranslation: BACK_TRANSLATION,
    flags: [
      { term: "500mg", kind: "dosage", confidence: 0.94 },
      { term: "Amoxicillin", kind: "drug", confidence: 0.97 },
      { term: "21 capsules", kind: "duration", confidence: 0.81 },
    ],
    approvedAt: null,
    audioUrl: null,
    outputVideoUrl: null,
    error: null,
  };
}

const SAMPLE_VIDEO =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";

/**
 * Captured photos live here, decoded once, keyed by job id.
 * Downstream code (Person B) should call `getJobImage(id)` for the raw bytes,
 * or fetch the stable URL `GET /api/jobs/:id/image` which streams the same JPEG.
 * `job.sourceImageUrl` always points at that URL, never at a huge data URL.
 */
const images = new Map<string, { contentType: string; bytes: Uint8Array }>();

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] ?? "image/jpeg";
  const binary = atob(match[2] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { contentType, bytes };
}

/** Raw captured photo for a job — the handoff point for the extraction step. */
export function getJobImage(id: string) {
  return images.get(id) ?? null;
}

export function createJob(input: { imageBase64?: string; targetLanguage: string }) {
  counter += 1;
  const id = `job_${String(counter).padStart(2, "0")}`;
  const decoded = input.imageBase64 ? decodeDataUrl(input.imageBase64) : null;
  if (decoded) images.set(id, decoded);
  const sourceImageUrl = decoded ? `/api/jobs/${id}/image` : "";
  const job = {
    ...fixture(id, input.targetLanguage, sourceImageUrl),
    createdAt: Date.now(),
    approvedAtMs: null,
  };
  jobs.set(id, job);
  return { id, status: job.status };
}

/** Advances the mock status timeline so the flow demos end to end without B or C. */
export function getJob(id: string): Job | null {
  const job = jobs.get(id);
  if (!job) return null;

  if (job.approvedAtMs === null) {
    const elapsed = Date.now() - job.createdAt;
    job.status = elapsed < 2500 ? "reading" : elapsed < 5000 ? "grounding" : "awaiting_approval";
  } else {
    const sinceApproval = Date.now() - job.approvedAtMs;
    if (sinceApproval < 6000) {
      job.status = "synthesizing";
    } else {
      job.status = "done";
      job.audioUrl = `/mock/${job.id}.mp3`;
      job.outputVideoUrl = SAMPLE_VIDEO;
    }
  }

  const { createdAt: _c, approvedAtMs: _a, ...rest } = job;
  return rest;
}

/** Edit + re-check: re-grounds the edited content. Never re-reads the photo. */
export function recheckJob(id: string, edited: EditedFields): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (edited.extracted) job.extracted = edited.extracted;
  if (typeof edited.transcription === "string") job.transcription = edited.transcription;
  if (typeof edited.plainScript === "string") job.plainScript = edited.plainScript;
  if (typeof edited.translation === "string") job.translation = edited.translation;

  // Mock re-grounding: recompute flags from the edited extraction + re-derive the
  // back-translation marker so the clinician can see the round trip changed.
  job.flags = job.extracted.flatMap((row) => [
    { term: row.dose, kind: "dosage" as const, confidence: 0.94 },
    { term: row.drug, kind: "drug" as const, confidence: 0.97 },
  ]);
  job.backTranslation = BACK_TRANSLATION;
  job.createdAt = Date.now() - 5000; // stay in awaiting_approval
  job.status = "awaiting_approval";
  return getJob(id);
}

export function approveJob(id: string, edited?: EditedFields): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (edited) recheckJob(id, edited);
  if (!job.translation.trim() || !job.backTranslation.trim()) return null;
  job.approvedAt = new Date().toISOString();
  job.approvedAtMs = Date.now();
  job.status = "synthesizing";
  return getJob(id);
}
