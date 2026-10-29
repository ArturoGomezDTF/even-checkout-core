"use client";

import { useTranslations } from "next-intl";
import { X, Camera } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ScanResult {
  cardNumber: string;
  expiryDate: string;
  cardholderName: string;
}

interface CardScannerProps {
  onScanSuccess: (result: ScanResult) => void;
  onClose: () => void;
}

export default function CardScanner({
  onScanSuccess,
  onClose,
}: CardScannerProps) {
  const t = useTranslations("CardScanner");
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError(t("errorCameraAccess"));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError(t("errorNoRefs"));
      return;
    }

    setIsCapturing(true);
    setError(null);

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error(t("errorNoCanvasContext"));
      }

      // Configurar tamaño del canvas
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;

      // Capturar frame del video
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      console.log("📸 Imagen capturada - listo para integrar procesamiento");

      // TODO: Aquí se integrará el procesamiento de la imagen
      // Por ahora, solo mostramos mensaje de éxito
      setError(t("capturePlaceholderMessage"));

    } catch (err) {
      console.error("❌ Error durante la captura:", err);
      setError(
        t("captureError", {
          message: err instanceof Error ? err.message : t("unknownError"),
        }),
      );
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black" style={{ zIndex: 999 }}>
      {/* Video Preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Canvas oculto para procesamiento */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header con botón de cerrar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-medium">{t("title")}</h2>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-white hover:text-gray-300 transition-colors cursor-pointer"
          >
            <X className="size-6" />
          </button>
        </div>
        <p className="text-white/90 text-sm mt-2">{t("subtitle")}</p>
      </div>

      {/* Card Frame Guide */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[320px] h-[200px]">
          {/* Esquinas del marco */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />

          {/* Animación cuando está capturando */}
          {isCapturing && (
            <div className="absolute inset-0 border-4 border-green-500 rounded-lg animate-pulse" />
          )}
        </div>
      </div>

      {/* Botón de captura en la parte inferior */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent p-6">
        <button
          onClick={handleCapture}
          disabled={isCapturing}
          className="w-full bg-white text-black px-6 py-4 rounded-full transition-colors hover:bg-gray-100 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="size-6" />
          <span className="font-medium">
            {isCapturing ? t("capturingCta") : t("captureCta")}
          </span>
        </button>
      </div>

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center px-6 max-w-md">
            <div className="bg-red-500/90 text-white p-6 rounded-lg">
              <p className="text-sm mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setError(null)}
                  className="bg-white text-black px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer font-medium"
                >
                  {t("retryCta")}
                </button>
                <button
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="bg-white/20 backdrop-blur text-white px-6 py-2 rounded-lg hover:bg-white/30 transition-colors cursor-pointer font-medium"
                >
                  {t("closeCta")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
