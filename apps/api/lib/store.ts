import type { Job } from "./types";

// In-memory job store — deliberately no database (hackathon non-goal).
// Kept on globalThis so Next.js dev-server HMR doesn't wipe jobs mid-demo.

const g = globalThis as typeof globalThis & { __medlingoJobs?: Map<string, Job> };

function seed(): Map<string, Job> {
  const jobs = new Map<string, Job>();

  const base = {
    status: "awaiting_approval" as const,
    sourceImageUrl: null,
    extracted: [{ drug: "Amoxicillin", dose: "500mg", freq: "TDS", days: 7 }],
    transcription:
      "[patient details removed]\nRx\nAmoxicillin 500mg capsules\n1 capsule TDS PO with food - 7/7\nComplete the full course even if feeling better.\nReturn advice: if pyrexial or rash develops, return to A&E.",
    plainScript:
      "This medicine is amoxicillin, an antibiotic. Take one capsule of 500 milligrams, three times a day, with food. Keep taking it for the full seven days, even if you start to feel better. If you notice a rash, or you develop a fever, come back to the hospital straight away.",
    flags: [
      { term: "500mg", kind: "dosage" as const, confidence: 0.94 },
      { term: "three times a day", kind: "frequency" as const, confidence: 0.91 },
      { term: "seven days", kind: "duration" as const, confidence: 0.93 },
      { term: "rash or fever", kind: "warning" as const, confidence: 0.88 },
    ],
    approvedAt: null,
    audioUrl: null,
    outputVideoUrl: null,
    error: null,
  };

  jobs.set("job_ur_demo", {
    ...base,
    id: "job_ur_demo",
    targetLanguage: "ur",
    translation:
      "یہ دوا اموکسیسیلن ہے، ایک اینٹی بایوٹک۔ ایک کیپسول، پانچ سو ملی گرام، دن میں تین بار، کھانے کے ساتھ لیں۔ پورے سات دن تک لیتے رہیں، چاہے آپ بہتر محسوس کرنے لگیں۔ اگر آپ کے جسم پر دانے نکل آئیں یا بخار ہو جائے تو فوراً ہسپتال واپس آئیں۔",
    backTranslation:
      "This medicine is amoxicillin, an antibiotic. Take one capsule, five hundred milligrams, three times a day with food. Keep taking it for the full seven days, even if you begin to feel better. If a rash appears on your body or you get a fever, return to the hospital immediately.",
  });

  jobs.set("job_pl_demo", {
    ...base,
    id: "job_pl_demo",
    targetLanguage: "pl",
    translation:
      "Ten lek to amoksycylina, antybiotyk. Proszę przyjmować jedną kapsułkę pięciuset miligramów trzy razy dziennie, z jedzeniem. Proszę kontynuować przez pełne siedem dni, nawet jeśli poczują się Państwo lepiej. Jeśli pojawi się wysypka lub gorączka, proszę natychmiast wrócić do szpitala.",
    backTranslation:
      "This medicine is amoxicillin, an antibiotic. Take one five-hundred-milligram capsule three times daily, with food. Continue for the full seven days, even if you feel better. If a rash or fever appears, return to the hospital immediately.",
  });

  return jobs;
}

function jobs(): Map<string, Job> {
  if (!g.__medlingoJobs) g.__medlingoJobs = seed();
  return g.__medlingoJobs;
}

export function getJob(id: string): Job | undefined {
  return jobs().get(id);
}

export function listJobs(): Job[] {
  return [...jobs().values()];
}

export function putJob(job: Job): Job {
  jobs().set(job.id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const job = jobs().get(id);
  if (!job) throw new Error(`Unknown job: ${id}`);
  const next = { ...job, ...patch };
  jobs().set(id, next);
  return next;
}

export function createJob(partial: Partial<Job> & { targetLanguage?: string }): Job {
  const id = partial.id ?? `job_${Date.now().toString(36)}`;
  const job: Job = {
    id,
    status: partial.status ?? "reading",
    sourceImageUrl: partial.sourceImageUrl ?? null,
    targetLanguage: partial.targetLanguage ?? "ur",
    extracted: partial.extracted ?? [],
    transcription: partial.transcription ?? "",
    plainScript: partial.plainScript ?? "",
    translation: partial.translation ?? "",
    backTranslation: partial.backTranslation ?? "",
    flags: partial.flags ?? [],
    approvedAt: partial.approvedAt ?? null,
    audioUrl: null,
    outputVideoUrl: null,
    error: null,
  };
  jobs().set(id, job);
  return job;
}
