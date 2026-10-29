// components/PaymentStatusVideo.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export type PaymentStatus = "processing" | "success" | "failed";

interface PaymentStatusVideoProps {
  status: PaymentStatus | null;
  onSuccessComplete?: () => void;
  onFailedComplete?: () => void;
}

const VIDEO_SRC: Record<PaymentStatus, string> = {
  processing: "/videos/payment-processing.mp4",
  success: "/videos/payment-success.mp4",
  failed: "/videos/payment-failed.mp4",
};

const TRIM_END_SECONDS: Partial<Record<PaymentStatus, number>> = {
  success: 2,
};

const MIN_PROCESSING_MS = 800;

export default function PaymentStatusVideo({
  status,
  onSuccessComplete,
  onFailedComplete,
}: PaymentStatusVideoProps) {
  const [effectiveStatus, setEffectiveStatus] = useState<PaymentStatus | null>(
    status,
  );
  const processingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (status === "processing") {
      processingStartedAtRef.current = Date.now();
      setEffectiveStatus("processing");
    } else if (status === null) {
      processingStartedAtRef.current = null;
      setEffectiveStatus(null);
    } else {
      const elapsed = processingStartedAtRef.current
        ? Date.now() - processingStartedAtRef.current
        : MIN_PROCESSING_MS;
      const remaining = Math.max(0, MIN_PROCESSING_MS - elapsed);

      if (remaining > 0) {
        timeoutId = setTimeout(() => setEffectiveStatus(status), remaining);
      } else {
        setEffectiveStatus(status);
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [status]);

  const [isReady, setIsReady] = useState(false);
  const [renderedStatus, setRenderedStatus] = useState<PaymentStatus | null>(
    effectiveStatus,
  );
  if (effectiveStatus !== renderedStatus) {
    setRenderedStatus(effectiveStatus);
    setIsReady(false);
  }

  const hasTrimmedRef = useRef(false);
  useEffect(() => {
    hasTrimmedRef.current = false;
  }, [effectiveStatus]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [effectiveStatus]);

  if (!effectiveStatus) return null;

  const handleEnded = () => {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    if (effectiveStatus === "success") onSuccessComplete?.();
    if (effectiveStatus === "failed") onFailedComplete?.();
    // "processing" se reproduce en bucle, no dispara onEnded
  };

  // Safari/iOS a veces bloquea el autoplay si el <video> se monta mientras
  // la pestaña estuvo suspendida (p. ej. al volver de la hoja nativa de
  // Apple Pay) — a pesar de traer muted+playsInline+autoPlay. Sin este
  // fallback, el video queda congelado sin controles visibles y el usuario
  // se queda trabado esperando algo que el navegador nunca va a reproducir
  // solo. Si el intento manual de .play() también falla, avanzamos igual
  // en vez de dejarlo esperando.
  const handleLoadedData = () => {
    setIsReady(true);
    videoRef.current?.play().catch(() => {
      if (effectiveStatus === "processing") return; // no depende de que termine
      handleEnded();
    });
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const trimSeconds = TRIM_END_SECONDS[effectiveStatus];
    if (!trimSeconds || hasTrimmedRef.current) return;

    const video = e.currentTarget;
    if (
      video.duration &&
      Number.isFinite(video.duration) &&
      video.currentTime >= video.duration - trimSeconds
    ) {
      hasTrimmedRef.current = true;
      video.pause();
      handleEnded();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[99999] brand-evergreen flex items-center justify-center transition-opacity duration-300 ${
        isReady ? "opacity-100" : "opacity-0"
      }`}
    >
      <video
        key={effectiveStatus}
        ref={videoRef}
        src={VIDEO_SRC[effectiveStatus]}
        autoPlay
        muted
        playsInline
        loop={effectiveStatus === "processing"}
        onLoadedData={handleLoadedData}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
