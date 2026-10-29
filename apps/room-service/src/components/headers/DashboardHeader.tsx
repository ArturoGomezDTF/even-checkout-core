"use client";

import { ChevronLeft, ChevronDown } from "lucide-react";
import { useRoomNavigation } from "../../hooks/useRoomNavigation";

interface DashboardHeaderProps {
  onClose?: () => void;
}

export default function DashboardHeader({
  onClose,
}: DashboardHeaderProps = {}) {
  const { navigateWithRoom } = useRoomNavigation();

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      navigateWithRoom("/menu");
    }
  };

  return (
    <header className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 z-1">
      <div className="relative flex items-center justify-between z-1">
        {/* Back Button */}
        <div className="flex items-center z-10">
          <div
            onClick={handleBack}
            className="size-10 md:size-12 lg:size-14 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-transform active:scale-95 duration-200"
          >
            {onClose ? (
              <ChevronDown className="text-primary size-5 md:size-6 lg:size-7" />
            ) : (
              <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
            )}
          </div>
        </div>

        {/* Even Logo */}
        <div
          onClick={() => navigateWithRoom("/menu")}
          className="absolute left-1/2 transform -translate-x-1/2 size-10 md:size-12 lg:size-14 active:scale-95 transition-transform duration-200 cursor-pointer"
        >
          <img src="/even/even-asterisk-evergreen.svg" alt="Even Logo" />
        </div>
      </div>
    </header>
  );
}
