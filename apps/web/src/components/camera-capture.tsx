import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  /** Called with a JPEG data URL whenever a still is captured. */
  onCapture: (dataUrl: string) => void;
  /** Open the stream as soon as the component mounts (used when retaking). */
  autoStart?: boolean;
};

type CameraState = "idle" | "starting" | "live" | "denied" | "unsupported";

export function CameraCapture({ onCapture, autoStart = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [flash, setFlash] = useState(false);
  const [shots, setShots] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (autoStart) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const start = useCallback(async (preferredDeviceId?: string) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError("This browser cannot open a camera stream.");
      return;
    }
    setState("starting");
    setError(null);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setState("live");
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId ?? "";
      setDeviceId(preferredDeviceId ?? active);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setState(name === "NotAllowedError" ? "denied" : "idle");
      setError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in the browser address bar, then try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : "Could not open the camera.",
      );
    }
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || state !== "live") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
    setShots((n) => n + 1);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-panel-border bg-panel shadow-sm">
      <div className="flex items-center gap-3 border-b border-panel-border px-5 py-4">
        <span className="h-8 w-1 rounded-full bg-gradient-to-b from-capture-from to-capture-to" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">Live camera</h2>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {state === "live"
              ? "Streaming · not recorded"
              : state === "starting"
                ? "Opening camera…"
                : "Camera off"}
          </p>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            state === "live" ? "bg-capture-from" : "bg-border"
          }`}
          aria-hidden
        />
      </div>

      <div className="relative aspect-video w-full bg-capture-surface">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${state === "live" ? "opacity-100" : "opacity-0"}`}
        />
        {/* framing guide */}
        {state === "live" && (
          <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-dashed border-white/70 mix-blend-difference" />
        )}
        {flash && <div className="absolute inset-0 bg-white/80" aria-hidden />}
        {state !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-capture-from to-capture-to text-white shadow-md">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a2 2 0 0 0 1.7-.95l.5-.8A2 2 0 0 1 10.6 3.3h2.8a2 2 0 0 1 1.7.95l.5.8A2 2 0 0 0 17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error ?? "Open the camera to photograph the prescription directly on this device."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-panel-border px-5 py-4">
        {state !== "live" ? (
          <Button
            type="button"
            size="lg"
            className="h-12"
            disabled={state === "starting"}
            onClick={() => void start(deviceId || undefined)}
          >
            {state === "starting" ? "Opening…" : error ? "Try again" : "Open camera"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="lg"
              className="h-12 border-0 bg-gradient-to-r from-capture-from to-capture-to text-white hover:opacity-90"
              onClick={capture}
            >
              Take photo
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={stop}>
              Stop camera
            </Button>
            {devices.length > 1 && (
              <Select
                value={deviceId}
                onValueChange={(value) => {
                  setDeviceId(value);
                  void start(value);
                }}
              >
                <SelectTrigger className="h-12 w-56">
                  <SelectValue placeholder="Camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {String(shots).padStart(2, "0")} captured
        </span>
      </div>
    </div>
  );
}
