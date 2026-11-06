"use client";

import { useRestaurant } from "@/app/context/RestaurantContext";

export default function DishSkeleton({ className = "" }: { className?: string }) {
  const { restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;

  return (
    <div className={`h-dvh bg-white overflow-hidden ${className}`}>
      {showImages && (
        <div className="w-full h-96 md:h-[28rem] lg:h-[32rem] bg-gray-200 animate-pulse" />
      )}
      <div className="px-6 md:px-8 pt-8 md:pt-10 space-y-4 animate-pulse">
        <div className="h-7 md:h-8 w-2/3 bg-gray-200" />
        <div className="h-4 md:h-5 w-full bg-gray-100" />
        <div className="h-4 md:h-5 w-5/6 bg-gray-100" />
        <div className="h-6 md:h-7 w-1/4 bg-gray-200 mt-8!" />
      </div>
    </div>
  );
}
