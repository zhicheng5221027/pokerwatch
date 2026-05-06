// Screen capture orchestration. Mirrors the visual-test-helper pattern:
// hidden <video> + offscreen canvas, polled at a configurable interval.
// Exposes a tiny pub/sub so other hooks (like useFrameLoop) can subscribe
// to the latest frame without re-rendering on every tick.
import { useCallback, useEffect, useRef, useState } from "react";

export type FrameLike = ImageBitmap | HTMLCanvasElement | null;

export interface CaptureFrame {
  /** ImageBitmap when supported, falls back to the canvas itself. */
  frame: FrameLike;
  /** Same image as a JPEG dataURL — useful for the LLM repair path. */
  dataUrl: string | null;
  width: number;
  height: number;
  capturedAt: number;
}

type FrameSubscriber = (f: CaptureFrame) => void;

interface UseScreenCaptureOpts {
  intervalMs: number;
  /** Longest side downsample target. Default 1024 per PRD §4.1. */
  maxSide?: number;
  /** JPEG quality for the dataURL fallback. Default 0.7 per PRD. */
  jpegQuality?: number;
}

export interface UseScreenCaptureReturn {
  isSharing: boolean;
  isStarting: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Last frame captured (object identity changes each tick). */
  lastFrame: CaptureFrame | null;
  lastFrameAt: number | null;
  subscribe: (cb: FrameSubscriber) => () => void;
}

export function useScreenCapture(
  opts: UseScreenCaptureOpts,
): UseScreenCaptureReturn {
  const { intervalMs, maxSide = 1024, jpegQuality = 0.7 } = opts;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const subscribersRef = useRef<Set<FrameSubscriber>>(new Set());
  const lastFrameRef = useRef<CaptureFrame | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<CaptureFrame | null>(null);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);

  // Lazy ensure offscreen <video> + <canvas>
  const ensureElements = useCallback(() => {
    if (!videoRef.current) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.style.position = "fixed";
      v.style.left = "-99999px";
      v.style.top = "-99999px";
      v.style.width = "1px";
      v.style.height = "1px";
      v.style.opacity = "0";
      v.setAttribute("aria-hidden", "true");
      document.body.appendChild(v);
      videoRef.current = v;
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
    }
    streamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        /* noop */
      }
    }
    setIsSharing(false);
  }, []);

  const captureOnce = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) return; // need data
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // downscale longest side to maxSide
    const longest = Math.max(vw, vh);
    const scale = longest > maxSide ? maxSide / longest : 1;
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Build the frame deliverable. Prefer ImageBitmap for cheap downstream consumption.
    let bitmap: ImageBitmap | null = null;
    try {
      if (typeof createImageBitmap === "function") {
        bitmap = await createImageBitmap(canvas);
      }
    } catch {
      bitmap = null;
    }

    let dataUrl: string | null = null;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
    } catch {
      dataUrl = null;
    }

    const f: CaptureFrame = {
      frame: bitmap ?? canvas,
      dataUrl,
      width: w,
      height: h,
      capturedAt: Date.now(),
    };
    lastFrameRef.current = f;
    setLastFrame(f);
    setLastFrameAt(f.capturedAt);
    subscribersRef.current.forEach((cb) => {
      try {
        cb(f);
      } catch (err) {
        console.warn("[useScreenCapture] subscriber threw", err);
      }
    });
  }, [maxSide, jpegQuality]);

  const start = useCallback(async () => {
    if (isSharing || isStarting) return;
    setError(null);
    setIsStarting(true);
    try {
      ensureElements();
      const md = navigator.mediaDevices;
      if (!md || typeof md.getDisplayMedia !== "function") {
        throw new Error("Screen capture not supported in this browser.");
      }
      const stream = await md.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {
        /* autoplay failures fine; canvas draw still works once data is ready */
      });

      // auto-stop on user clicking the browser "Stop sharing" UI
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener("ended", () => stop(), { once: true });
      });

      setIsSharing(true);

      // kick the loop
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        void captureOnce();
      }, Math.max(500, intervalMs));
      // and grab a frame ASAP
      void captureOnce();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Capture failed.";
      setError(msg);
      stop();
    } finally {
      setIsStarting(false);
    }
  }, [captureOnce, ensureElements, intervalMs, isSharing, isStarting, stop]);

  // If interval changes mid-share, reset the timer.
  useEffect(() => {
    if (!isSharing) return;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      void captureOnce();
    }, Math.max(500, intervalMs));
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [intervalMs, isSharing, captureOnce]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stop();
      if (videoRef.current) {
        try {
          videoRef.current.remove();
        } catch {
          /* noop */
        }
        videoRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback((cb: FrameSubscriber) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  return {
    isSharing,
    isStarting,
    error,
    start,
    stop,
    lastFrame,
    lastFrameAt,
    subscribe,
  };
}
