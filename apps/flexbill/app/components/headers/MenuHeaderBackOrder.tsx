"use client";

import { Restaurant } from "../../interfaces/restaurante";
import { useTableNavigation } from "../../hooks/useTableNavigation";
import ParticipantsHeader from "./ParticipantsHeader";

interface MenuHeaderProps {
  restaurant: Restaurant;
  tableNumber?: string;
}

export default function MenuHeaderBackOrder({
  restaurant,
  tableNumber,
}: MenuHeaderProps) {
  const { navigateWithTable } = useTableNavigation();

  const handleBack = () => {
    navigateWithTable("/menu");
  };

  return (
    <ParticipantsHeader
      restaurant={restaurant}
      tableNumber={tableNumber}
      onBack={handleBack}
    />
  );
}
