"use client";

import { Camera, Keyboard, Loader, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CardScanResult {
  cardNumber: string;
  expiryDate: string;
  cardholderName: string;
}

export interface CardScannerLabels {
  title: string;
  subtitle: string;
  scanningCta: string;
  errorCameraAccess: string;
  errorScan: string;
}

/**
 * Textos por idioma, con las mismas llaves que el namespace `CardScanner` de
 * next-intl en las apps. Una app con next-intl puede pasar los suyos:
 * `const t = useTranslations("CardScanner")` y `labels={{ title: t("title"), ... }}`.
 */
export const CARD_SCANNER_MESSAGES = {
  es: {
    title: "Escanear Tarjeta",
    subtitle: "Coloca tu tarjeta dentro del marco",
    scanningCta: "Escaneando...",
    errorCameraAccess: "No se pudo acceder a la cámara. Por favor, verifica los permisos.",
    errorScan: "Error al escanear la tarjeta. Intenta de nuevo.",
  },
  en: {
    title: "Scan Card",
    subtitle: "Place your card inside the frame",
    scanningCta: "Scanning...",
    errorCameraAccess: "Couldn't access the camera. Please check your permissions.",
    errorScan: "Error scanning the card. Please try again.",
  },
} satisfies Record<string, CardScannerLabels>;

export type CardScanFn = (video: HTMLVideoElement) => Promise<CardScanResult>;

/**
 * Escaneo simulado (tarjeta de prueba tras 2 s), el mismo que usan hoy las
 * apps mientras no se integra el SDK de Dyneti.
 */
export const simulateCardScan: CardScanFn = () =>
  new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          cardNumber: "4242424242424242",
          expiryDate: "12/25",
          cardholderName: "Test User",
        }),
      2000,
    );
  });

export interface CardScannerProps {
  onScanSuccess: (result: CardScanResult) => void;
  onClose: () => void;
  labels?: CardScannerLabels;
  /** Implementación del escaneo (p. ej. Dyneti). Por defecto, simulado. */
  scan?: CardScanFn;
}

export function CardScanner({
  onScanSuccess,
  onClose,
  labels = CARD_SCANNER_MESSAGES.es,
  scan = simulateCardScan,
}: CardScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const errorCameraAccess = labels.errorCameraAccess;
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((stream) => {
        // Desmontado antes de que el usuario aceptara el permiso.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        console.error("Error accessing camera:", err);
        if (!cancelled) setError(errorCameraAccess);
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera, errorCameraAccess]);

  const handleScan = async () => {
    if (!videoRef.current) return;
    setIsScanning(true);
    setError(null);
    try {
      const result = await scan(videoRef.current);
      stopCamera();
      onScanSuccess(result);
    } catch (err) {
      console.error("Error scanning card:", err);
      setError(labels.errorScan);
    } finally {
      setIsScanning(false);
    }
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/40 to-transparent p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-medium">{labels.title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="text-white hover:text-gray-400 transition-colors cursor-pointer"
          >
            <X className="size-6" />
          </button>
        </div>
        <p className="text-white/80 text-sm mt-2">{labels.subtitle}</p>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[320px] h-[200px]">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
          {isScanning && (
            <div className="absolute inset-0 border-4 border-even-grass rounded-lg animate-pulse" />
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="absolute top-24 left-4 right-4 bg-red-500/90 text-white p-4 rounded-lg">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="flex-1 w-full text-even-evergreen py-4 rounded-full cursor-pointer transition-opacity bg-even-grass hover:opacity-90 disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <Loader className="size-5 animate-spin" />
                {labels.scanningCta}
              </>
            ) : (
              <>
                <Camera className="size-6" />
                {labels.title}
              </>
            )}
          </button>

          <button
            type="button"
            aria-label="Ingresar manualmente"
            onClick={close}
            className="text-black py-3 rounded-full transition-colors bg-white hover:bg-stone-100 w-14 h-14 flex items-center justify-center flex-shrink-0 cursor-pointer"
          >
            <Keyboard className="size-6 text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}
