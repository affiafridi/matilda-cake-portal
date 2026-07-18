"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "recording" | "paused" | "preview";

type Props = {
  sending:  boolean;
  onSend:   (blob: Blob) => void;
  onCancel: () => void;
};

export default function VoiceRecorder({ sending, onSend, onCancel }: Props) {
  const [phase,      setPhase]      = useState<Phase>("recording");
  const [seconds,    setSeconds]    = useState(0);
  const [blob,       setBlob]       = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [micFailed,  setMicFailed]  = useState(false);

  const recorderRef  = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const rafRef       = useRef<number | null>(null);
  const phaseRef     = useRef<Phase>("recording");
  const mountedRef   = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Start recording on mount ──────────────────────────────────────────────
  useEffect(() => {
    let dead = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source   = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize              = 128;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
          ? "audio/ogg; codecs=opus"
          : "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;
        chunksRef.current   = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          stopTimer();
          stopCanvas();
          if (!mountedRef.current) return;
          const b   = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(b);
          setBlob(b);
          setPreviewUrl(url);
          setPhase("preview");
        };

        recorder.start();
        startTimer();
        drawWaveform();
      } catch {
        // Mic unavailable — stay in recording UI but mark failed so we show upload fallback
        if (!dead) setMicFailed(true);
      }
    })();

    return () => {
      dead = true;
      mountedRef.current = false;
      releaseResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer() {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ── Canvas waveform ───────────────────────────────────────────────────────
  function drawWaveform() {
    const analyser = analyserRef.current;
    const canvas   = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const safeAnalyser = analyser;
    const safeCanvas   = canvas;
    const safeCtx      = ctx;
    const data = new Uint8Array(safeAnalyser.frequencyBinCount);

    function frame() {
      if (phaseRef.current === "preview") return;
      safeAnalyser.getByteFrequencyData(data);
      const W = safeCanvas.width;
      const H = safeCanvas.height;
      safeCtx.clearRect(0, 0, W, H);
      const BAR_COUNT = 28, BAR_W = 3, GAP = 2.5;
      const totalW = BAR_COUNT * (BAR_W + GAP) - GAP;
      const startX = (W - totalW) / 2;
      for (let i = 0; i < BAR_COUNT; i++) {
        const binIdx = Math.floor(Math.pow(i / BAR_COUNT, 0.8) * data.length);
        const value  = data[binIdx] / 255;
        const barH   = Math.max(3, value * H * 0.88);
        const x      = startX + i * (BAR_W + GAP);
        const y      = (H - barH) / 2;
        safeCtx.globalAlpha = phaseRef.current === "paused" ? 0.35 : 0.55 + value * 0.45;
        safeCtx.fillStyle   = phaseRef.current === "paused" ? "#94a3b8" : "#00a884";
        safeCtx.beginPath();
        if (safeCtx.roundRect) safeCtx.roundRect(x, y, BAR_W, barH, BAR_W / 2);
        else safeCtx.rect(x, y, BAR_W, barH);
        safeCtx.fill();
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    frame();
  }

  function stopCanvas() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }

  function releaseResources() {
    stopTimer();
    stopCanvas();
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
  }

  // ── Recorder actions ──────────────────────────────────────────────────────
  function handlePause() {
    recorderRef.current?.pause();
    stopTimer();
    stopCanvas();
    phaseRef.current = "paused";
    setPhase("paused");
    requestAnimationFrame(() => {
      const analyser = analyserRef.current;
      const canvas   = canvasRef.current;
      if (!analyser || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const BAR_COUNT = 28, BAR_W = 3, GAP = 2.5;
      const totalW = BAR_COUNT * (BAR_W + GAP) - GAP;
      const startX = (canvas.width - totalW) / 2;
      for (let i = 0; i < BAR_COUNT; i++) {
        const binIdx = Math.floor(Math.pow(i / BAR_COUNT, 0.8) * data.length);
        const value  = data[binIdx] / 255;
        const barH   = Math.max(3, value * canvas.height * 0.88);
        const x      = startX + i * (BAR_W + GAP);
        const y      = (canvas.height - barH) / 2;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle   = "#94a3b8";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, BAR_W / 2);
        else ctx.rect(x, y, BAR_W, barH);
        ctx.fill();
      }
    });
  }

  function handleResume() {
    recorderRef.current?.resume();
    startTimer();
    phaseRef.current = "recording";
    setPhase("recording");
    drawWaveform();
  }

  function handleStop() {
    recorderRef.current?.stop();
  }

  function handleCancel() {
    releaseResources();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onCancel();
  }

  function handleSend() {
    if (blob) onSend(blob);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setBlob(file);
    setPreviewUrl(url);
    setPhase("preview");
    // reset input so same file can be re-selected
    e.target.value = "";
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full items-center gap-2">

      {/* Cancel */}
      <button type="button" onClick={handleCancel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition hover:bg-red-50 hover:text-red-500"
        title="Cancel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      {/* Main pill */}
      {phase === "preview" ? (
        /* Preview */
        <div className="flex flex-1 min-w-0 items-center gap-2.5 rounded-[24px] bg-white shadow-sm px-3 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00a884]/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#00a884]">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
          </div>
          {previewUrl && (
            <audio src={previewUrl} controls className="flex-1 min-w-0" style={{ height: "28px", accentColor: "#00a884" }} />
          )}
          {!micFailed && (
            <span className="shrink-0 font-mono text-[11px] text-[#54656f] tabular-nums">{fmt(seconds)}</span>
          )}
        </div>
      ) : micFailed ? (
        /* Mic unavailable — show inline upload fallback */
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-1 min-w-0 items-center gap-3 rounded-[24px] bg-white shadow-sm px-4 h-10 text-left transition hover:bg-gray-50">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-500">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <line x1="2" y1="2" x2="22" y2="22"/>
            </svg>
          </div>
          <span className="flex-1 text-[12.5px] text-[#54656f]">Mic unavailable — tap to upload audio</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-[#94a3b8]">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
      ) : (
        /* Live recording / paused */
        <div className="flex flex-1 min-w-0 items-center gap-3 rounded-[24px] bg-white shadow-sm px-4 h-10">
          {phase === "recording" ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
          )}
          <span className="shrink-0 text-[12.5px] text-[#54656f]">
            {phase === "recording" ? "Recording" : "Paused"}
          </span>
          <canvas ref={canvasRef} width={140} height={28} className="flex-1" style={{ maxWidth: 140 }} />
          <span className={[
            "shrink-0 font-mono text-[13px] font-semibold tabular-nums",
            phase === "recording" ? "text-red-500" : "text-amber-500",
          ].join(" ")}>
            {fmt(seconds)}
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Pause / Resume — only during live recording phases */}
      {phase !== "preview" && !micFailed && (
        <button type="button"
          onClick={phase === "recording" ? handlePause : handleResume}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#54656f] shadow-sm transition hover:bg-gray-100"
          title={phase === "recording" ? "Pause" : "Resume"}>
          {phase === "recording" ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <rect x="5" y="4" width="4" height="16" rx="1.5"/>
              <rect x="15" y="4" width="4" height="16" rx="1.5"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-[#00a884]">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>
      )}

      {/* Stop → Send (hidden when mic failed and no file chosen yet) */}
      {(phase === "preview" || !micFailed) && (
        <button type="button"
          onClick={phase === "preview" ? handleSend : handleStop}
          disabled={sending || (phase === "preview" && !blob)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#00916e] disabled:opacity-40"
          title={phase === "preview" ? "Send voice message" : "Stop recording"}>
          {sending ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          ) : phase === "preview" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
