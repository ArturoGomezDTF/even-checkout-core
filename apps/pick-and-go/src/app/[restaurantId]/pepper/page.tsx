"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import ChatView from "@/components/ChatView";
import { useRestaurant } from "@/context/RestaurantContext";

export default function PepperPage() {
  const { setRestaurantId } = useRestaurant();
  const params = useParams();
  const router = useRouter();
  const restaurantId = params?.restaurantId as string;

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  const handleBack = () => {
    router.back();
  };

  return <ChatView onBack={handleBack} />;
}
