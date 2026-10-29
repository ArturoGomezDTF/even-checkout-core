"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface MenuHeaderBackProps {
  onBack?: () => void;
}

export default function MenuHeaderBack({ onBack }: MenuHeaderBackProps = {}) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <header className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 z-10">
      <div className="relative flex items-center justify-between z-10">
        {/* Back */}
        <div className="flex items-center z-10">
          <div
            onClick={handleBack}
            className="size-10 md:size-12 lg:size-14 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 active:scale-95 transition-transform duration-200"
          >
            <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
          </div>
        </div>

        {/* Even Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-10 md:size-12 lg:size-14">
          <img src="/even/even-asterisk-grass.svg" alt="Even" />
        </div>

        {/* Espacio para mantener el layout */}
        <div className="w-10 md:w-12 lg:w-14"></div>
      </div>
    </header>
  );
}
