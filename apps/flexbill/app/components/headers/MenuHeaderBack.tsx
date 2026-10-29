"use client";

import { Restaurant } from "../../interfaces/restaurante";
import { useTableNavigation } from "../../hooks/useTableNavigation";
import { usePathname, useRouter } from "next/navigation";
import ParticipantsHeader from "./ParticipantsHeader";

interface MenuHeaderProps {
  restaurant: Restaurant;
  tableNumber?: string;
  onBack?: () => void;
}

export default function MenuHeaderBack({
  restaurant,
  tableNumber,
  onBack,
}: MenuHeaderProps) {
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const pathname = usePathname();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (pathname?.includes("payment-options")) {
      navigateWithTable("/order");
    } else {
      router.back();
    }
  };

  return (
    <ParticipantsHeader
      restaurant={restaurant}
      tableNumber={tableNumber}
      onBack={handleBack}
    />
  );
}
