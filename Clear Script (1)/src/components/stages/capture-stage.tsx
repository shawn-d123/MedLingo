import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CameraCapture } from "@/components/camera-capture";
import { StageLoading } from "@/components/stage-progress";
import { LANGUAGES } from "@/lib/job";
import { createJobRequest, usingMock } from "@/lib/jobs.api";

export function CaptureStage({
  onJobCreated,
  onBack,
}: {
  onJobCreated: (jobId: string) => void;
  onBack: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("ur");
  const [submitting, setSubmitting] = useState(false);
  const [retakes, setRetakes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function retake() {
    setPreview(null);
    setFileName(null);
    setError(null);
    setRetakes((n) => n + 1);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview) {
      setError("Take a photo of the prescription first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const job = await createJobRequest({ imageBase64: preview, targetLanguage });
      onJobCreated(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the job.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <StageLoading
        title="Sending the photo for reading"
        detail="Storing the capture with the job, then reading the prescription and grounding the drug names. You'll land on the approval screen automatically."
      />
    );
  }

  return (
    <form onSubmit={submit}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Step 1 of 3
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {preview ? "Check the photo" : "Capture the prescription"}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {preview
              ? "Make sure every line is readable and in frame. Retake it if anything is cut off or blurred."
              : "Hold the sheet flat inside the frame and take the photo. The image is stored with the job so it can be read and structured."}
          </p>
        </div>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onBack}>
          Back
        </Button>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {preview ? (
            <div className="soft-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-panel-border px-6 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide">Captured photo</h2>
                {fileName && (
                  <span className="font-mono text-xs text-muted-foreground">{fileName}</span>
                )}
              </div>
              <div className="soft-inset m-4 flex h-[26rem] items-center justify-center overflow-hidden">
                <img
                  src={preview}
                  alt="Captured prescription"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex items-center gap-3 border-t border-panel-border px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-full px-6"
                  onClick={retake}
                >
                  Retake photo
                </Button>
                <span className="text-sm text-muted-foreground">
                  The camera stays closed until you retake.
                </span>
              </div>
            </div>
          ) : (
            <>
              <CameraCapture
                autoStart={retakes > 0}
                onCapture={(dataUrl) => {
                  setPreview(dataUrl);
                  setFileName(`camera-still-${new Date().toISOString().slice(11, 19)}.jpg`);
                  setError(null);
                }}
              />

              <div className="soft-card p-6">
                <Label htmlFor="photo" className="text-sm text-muted-foreground">
                  Or pick an existing file
                </Label>
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  className="mt-2 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>
            </>
          )}
        </div>

        <aside className="space-y-6">
          <div className="soft-card p-6">
            <Label htmlFor="language" className="text-base font-semibold">
              Patient's language
            </Label>
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger id="language" className="mt-3 h-12 w-full rounded-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code} className="text-base">
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-3 text-sm text-muted-foreground">
              Fixed before anything is generated, so you approve the wording the patient receives.
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-divergence bg-divergence-surface px-4 py-3 text-sm text-divergence-foreground">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={!preview}
            className="h-14 w-full rounded-full border-0 text-base text-primary-foreground brand-gradient shadow-lg hover:opacity-90 disabled:opacity-40"
          >
            {preview ? "Use this photo" : "Take a photo first"}
          </Button>
          {usingMock && (
            <p className="font-mono text-xs text-muted-foreground">Mock pipeline active</p>
          )}
        </aside>
      </div>
    </form>
  );
}
