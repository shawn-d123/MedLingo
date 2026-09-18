export type JobStatus =
  | "reading"
  | "grounding"
  | "awaiting_approval"
  | "synthesizing"
  | "done"
  | "failed";

export type ExtractedItem = {
  drug: string;
  dose: string;
  freq: string;
  days: number;
  /** Free-text directions for this medicine — prescriptions rarely fit four fields. */
  notes?: string;
  /** Anything else the reader picked up: route, quantity, PRN limits, warnings… */
  extra?: Record<string, string>;
};

export type Flag = {
  term: string;
  kind: "dosage" | "drug" | "duration" | string;
  confidence: number;
};

export type Job = {
  id: string;
  status: JobStatus;
  sourceImageUrl: string;
  targetLanguage: string;
  extracted: ExtractedItem[];
  /** Full readable transcription of the prescription, beyond the structured rows. */
  transcription: string;
  plainScript: string;
  translation: string;
  backTranslation: string;
  flags: Flag[];
  approvedAt: string | null;
  audioUrl: string | null;
  outputVideoUrl: string | null;
  error: string | null;
};

export type EditedFields = {
  extracted?: ExtractedItem[];
  transcription?: string;
  plainScript?: string;
  translation?: string;
};

export const LANGUAGES = [
  { code: "ur", label: "Urdu — اردو", rtl: true },
  { code: "pl", label: "Polish — Polski", rtl: false },
] as const;

export function languageLabel(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function isRtl(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.rtl ?? false;
}

export const STATUS_COPY: Record<JobStatus, string> = {
  reading: "Reading the prescription photo",
  grounding: "Checking drug names and doses against reference data",
  awaiting_approval: "Waiting for clinician approval",
  synthesizing: "Generating the patient video",
  done: "Video ready",
  failed: "Something stopped the pipeline",
};

/** Ordering guard: nothing downstream may run before both translations exist. */
export function canApprove(job: Job) {
  return (
    job.status === "awaiting_approval" &&
    job.translation.trim().length > 0 &&
    job.backTranslation.trim().length > 0 &&
    job.approvedAt === null
  );
}
