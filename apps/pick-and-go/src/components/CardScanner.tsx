"use client";

import { Camera, Loader, X, Keyboard } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

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
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);

    try {
      // TODO: Integrar Dyneti SDK aquí
      // const dynetiApiKey = process.env.NEXT_PUBLIC_DYNETI_API_KEY;

      // Simulación para desarrollo
      await simulateScan();

      // Implementación real con Dyneti:
      // const result = await DynetiSDK.scanCard(videoRef.current);
      // onScanSuccess({
      //   cardNumber: result.cardNumber,
      //   expiryDate: result.expiryDate,
      //   cardholderName: result.cardholderName,
      // });
    } catch (err) {
      console.error("Error scanning card:", err);
      setError(t("errorScan"));
    } finally {
      setIsScanning(false);
    }
  };

  // Simulación temporal para desarrollo (test card)
  const simulateScan = async () => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        onScanSuccess({
          cardNumber: "4242424242424242",
          expiryDate: "12/25",
          cardholderName: "Test User",
        });
        stopCamera();
        resolve();
      }, 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/40 to-transparent p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-medium">{t("title")}</h2>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-white hover:text-gray-400 transition-colors cursor-pointer"
          >
            <X className="size-6" />
          </button>
        </div>
        <p className="text-white/80 text-sm mt-2">{t("subtitle")}</p>
      </div>

      {/* Video Preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Card Frame */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[320px] h-[200px]">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />

          {isScanning && (
            <div className="absolute inset-0 border-4 border-green-500 rounded-lg animate-pulse" />
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="absolute top-24 left-4 right-4 bg-red-500/90 text-white p-4 rounded-lg">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-6">
        <div className="flex items-center gap-4">
          {/* Scan Button */}
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex-1 w-full text-even-evergreen py-4 rounded-full cursor-pointer transition-opacity bg-even-grass hover:opacity-90 disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isScanning ? (
              <>
                <Loader className="size-5 animate-spin" />
                {t("scanningCta")}
              </>
            ) : (
              <>
                <Camera className="size-6" />
                {t("title")}
              </>
            )}
          </button>

          {/* Manual Entry Button */}
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-black py-3 rounded-full transition-colors bg-white hover:bg-stone-100 w-14 h-14 flex items-center justify-center flex-shrink-0 cursor-pointer"
          >
            <Keyboard className="size-6 text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}
