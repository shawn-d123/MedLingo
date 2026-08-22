// THE JOB OBJECT — the one contract A, B and C all build against.
// Nobody changes this shape without telling the other two.

export type JobStatus =
  | "reading"
  | "grounding"
  | "awaiting_approval"
  | "synthesizing"
  | "done"
  | "failed";

export interface ExtractedMedication {
  drug: string;
  dose: string;
  freq: string;
  days: number;
}

export interface Flag {
  term: string;
  kind: "dosage" | "frequency" | "duration" | "warning" | "drug";
  confidence: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  sourceImageUrl: string | null;
  targetLanguage: string; // e.g. "ur", "pl" — captured at intake, alongside the photo
  extracted: ExtractedMedication[];
  plainScript: string;
  translation: string; // the APPROVED translation — this is what the presenter speaks
  backTranslation: string;
  flags: Flag[];
  approvedAt: string | null; // Person C's pipeline must NEVER run before this is set
  audioUrl: string | null; // written by Person C only
  outputVideoUrl: string | null; // written by Person C only
  error: string | null;
  // Person C addition (additive, optional — flagged to A & B in the README):
  // English WebVTT subtitles for the result player, served at GET /api/jobs/:id/subtitles
  subtitlesVtt?: string | null;
}
