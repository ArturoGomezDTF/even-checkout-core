"use client";

import { useState, useMemo } from "react";
import { Clock, ChevronRight, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

interface PickupTimeSelectorProps {
  selectedTime: string | null; // null = "Lo antes posible", string = ISO time
  onTimeChange: (time: string | null) => void;
  estimatedMinutes?: number;
}

export default function PickupTimeSelector({
  selectedTime,
  onTimeChange,
  estimatedMinutes = 15,
}: PickupTimeSelectorProps) {
  const t = useTranslations("PickupTimeSelector");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [isScheduled, setIsScheduled] = useState(selectedTime !== null);
  const [tempSelectedTime, setTempSelectedTime] = useState<string | null>(
    selectedTime,
  );

  // Generar slots de tiempo disponibles (cada 30 minutos, 8 slots en 4 horas)
  const timeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [];
    const now = new Date();

    // Redondear al siguiente slot de 30 minutos + tiempo de preparación
    const startTime = new Date(now);
    const minMinutes = now.getMinutes() + estimatedMinutes;
    startTime.setMinutes(Math.ceil(minMinutes / 30) * 30);
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    // Generar 8 slots (cada 30 min = 4 horas)
    for (let i = 0; i < 8; i++) {
      const slotTime = new Date(startTime.getTime() + i * 30 * 60 * 1000);

      // No mostrar slots después de las 10pm o antes de las 8am
      const hours = slotTime.getHours();
      if (hours >= 22 || hours < 8) continue;

      const timeStr = format.dateTime(slotTime, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      slots.push({
        value: slotTime.toISOString(),
        label: timeStr,
      });
    }

    return slots;
  }, [estimatedMinutes]);

  // Cuando se abre el modal, sincronizar estado temporal
  const handleOpenModal = () => {
    setIsScheduled(selectedTime !== null);
    setTempSelectedTime(selectedTime);
    setShowTimeModal(true);
  };

  // Confirmar selección
  const handleConfirm = () => {
    if (isScheduled && tempSelectedTime) {
      onTimeChange(tempSelectedTime);
    } else {
      onTimeChange(null);
    }
    setShowTimeModal(false);
  };

  // Formatear el tiempo seleccionado para mostrar
  const getDisplayText = () => {
    if (!selectedTime) {
      return t("asapWithMinutes", { minutes: estimatedMinutes });
    }
    const date = new Date(selectedTime);
    const timeStr = format.dateTime(date, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return t("todayAt", { time: timeStr });
  };

  return (
    <>
      {/* Selector compacto - estilo similar a sucursal */}
      <div
        className="mb-4 flex items-center justify-between w-full cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleOpenModal}
      >
        <div className="flex items-center gap-2">
          <p className="text-gray-600 text-base">
            {t("pickupLabel")}{" "}
            <span className="font-medium text-black">{getDisplayText()}</span>
          </p>
        </div>
        <ChevronRight className="size-4 md:size-5 text-gray-600 flex-shrink-0" />
      </div>

      {/* Modal de selección de tiempo */}
      {showTimeModal && (
        <div
          className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
          style={{ zIndex: 99999 }}
        >
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowTimeModal(false)}
          />

          <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[75vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#8e8e8e]">
                <h3 className="text-lg font-semibold text-black">
                  {t("modalTitle")}
                </h3>
                <button
                  onClick={() => setShowTimeModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="size-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Toggle: Lo antes posible / Programar */}
            <div className="px-6 py-4">
              <div className="flex bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => setIsScheduled(false)}
                  className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                    !isScheduled
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {t("asapOption")}
                </button>
                <button
                  onClick={() => {
                    setIsScheduled(true);
                    // Si no hay tiempo seleccionado, seleccionar el primero
                    if (!tempSelectedTime && timeSlots.length > 0) {
                      setTempSelectedTime(timeSlots[0].value);
                    }
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                    isScheduled
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  {t("scheduleOption")}
                </button>
              </div>

              {/* Subtexto para "Lo antes posible" */}
              {!isScheduled && (
                <p className="text-center text-gray-500 text-sm mt-3">
                  {t("readyInMinutes", { minutes: estimatedMinutes })}
                </p>
              )}
            </div>

            {/* Lista de slots - Solo visible cuando isScheduled */}
            {isScheduled && (
              <div className="px-6 pb-2 overflow-y-auto max-h-[40vh]">
                <div className="space-y-2">
                  {timeSlots.map((slot) => (
                    <div
                      key={slot.value}
                      onClick={() => setTempSelectedTime(slot.value)}
                      className={`py-3 px-5 border rounded-full cursor-pointer transition-colors ${
                        tempSelectedTime === slot.value
                          ? "border-even-grass bg-even-grass/10"
                          : "border-black/30 bg-surface hover:border-gray-400"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-black">{slot.label}</p>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            tempSelectedTime === slot.value
                              ? "border-even-grass bg-even-grass"
                              : "border-gray-300"
                          }`}
                        >
                          {tempSelectedTime === slot.value && (
                            <div className="w-full h-full rounded-full bg-white scale-50" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={handleConfirm}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer transition-opacity hover:opacity-90"
              >
                {tc("confirmCta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
