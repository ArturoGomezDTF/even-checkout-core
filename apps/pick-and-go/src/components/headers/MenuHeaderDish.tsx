"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function MenuHeaderDish() {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  return (
    <header className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 z-10">
      <div className="relative flex items-center justify-between z-10">
        {/* Back */}
        <div className="flex items-center z-10">
          <div
            onClick={handleBack}
            className="size-10 md:size-12 lg:size-14 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm shadow-sm hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer"
          >
            <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
          </div>
        </div>
      </div>
    </header>
  );
}
