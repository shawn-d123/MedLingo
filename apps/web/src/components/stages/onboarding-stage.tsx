import { Button } from "@/components/ui/button";

export function OnboardingStage({ onStart }: { onStart: () => void }) {
  return (
    <section className="grid items-center gap-14 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
          <span className="h-2 w-2 rounded-full brand-gradient" />
          Clinician tool · demo
        </span>

        <h1 className="mt-6 text-6xl font-semibold tracking-tight">
          Med
          <span className="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text text-transparent">
            Lingo
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-xl text-muted-foreground">
          Photograph a prescription and MedLingo turns it into a short video that explains the
          medicine in the patient's own language — reviewed and approved by you first.
        </p>

        <ol className="mt-9 grid gap-3 sm:grid-cols-3">
          {[
            ["01", "Capture", "Take the photo with this device's camera."],
            ["02", "Approve", "Check the translation and back-translation."],
            ["03", "Hand over", "Patient leaves with a video they understand."],
          ].map(([step, title, copy]) => (
            <li key={step} className="soft-card p-5">
              <span className="font-mono text-xs text-muted-foreground">{step}</span>
              <h2 className="mt-1 text-base font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ol>

        <Button
          size="lg"
          onClick={onStart}
          className="mt-10 h-14 rounded-full border-0 px-10 text-base text-primary-foreground brand-gradient shadow-lg transition hover:opacity-90"
        >
          Capture prescription
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing is sent to the patient until you approve it.
        </p>
      </div>

      <div className="soft-card relative overflow-hidden p-10">
        <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full brand-gradient text-primary-foreground shadow-xl">
          <svg
            viewBox="0 0 24 24"
            className="h-20 w-20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect x="3" y="3" width="18" height="18" rx="6" />
            <path d="M8 12h8M12 8v8" />
          </svg>
        </div>
        <p className="mt-8 text-center text-lg font-medium">Urdu and Polish, ready today</p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Voice, subtitles and an AI-generated presenter, built from the wording you sign off.
        </p>
        <div className="mt-8 space-y-3">
          <div className="soft-inset h-3 w-full" />
          <div className="soft-inset h-3 w-4/5" />
          <div className="soft-inset h-3 w-2/3" />
        </div>
      </div>
    </section>
  );
}
