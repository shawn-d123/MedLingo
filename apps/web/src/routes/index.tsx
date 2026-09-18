import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { OnboardingStage } from "@/components/stages/onboarding-stage";
import { CaptureStage } from "@/components/stages/capture-stage";
import { ApprovalStage } from "@/components/stages/approval-stage";
import { ResultStage } from "@/components/stages/result-stage";
import { StageProgress } from "@/components/stage-progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedLingo — prescriptions explained in the patient's language" },
      {
        name: "description",
        content:
          "MedLingo turns a photo of a prescription into a clinician-approved video that explains the medicine in the patient's own language.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "MedLingo — prescriptions explained in the patient's language",
      },
      {
        property: "og:description",
        content:
          "Capture a prescription, approve the translation and back-translation, and hand the patient a video they understand.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MedLingoFlow,
});

type Stage = "onboarding" | "capture" | "approval" | "result";

function MedLingoFlow() {
  const [stage, setStage] = useState<Stage>("onboarding");
  const [jobId, setJobId] = useState<string | null>(null);

  const goResult = useCallback(() => setStage("result"), []);

  return (
    <div className="page-canvas min-h-screen">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <nav className="mb-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl brand-gradient text-primary-foreground shadow-md">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 12h8M12 8v8" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">MedLingo</span>
          {jobId && (
            <span className="ml-auto font-mono text-xs text-muted-foreground">{jobId}</span>
          )}
        </nav>

        <div className="mb-8">
          <StageProgress stage={stage} busy={stage === "approval" || stage === "result"} />
        </div>

        {stage === "onboarding" && <OnboardingStage onStart={() => setStage("capture")} />}

        {stage === "capture" && (
          <CaptureStage
            onBack={() => setStage("onboarding")}
            onJobCreated={(id) => {
              setJobId(id);
              setStage("approval");
            }}
          />
        )}

        {stage === "approval" && jobId && <ApprovalStage jobId={jobId} onApproved={goResult} />}

        {stage === "result" && jobId && (
          <ResultStage
            jobId={jobId}
            onRestart={() => {
              setJobId(null);
              setStage("onboarding");
            }}
          />
        )}
      </div>
    </div>
  );
}
