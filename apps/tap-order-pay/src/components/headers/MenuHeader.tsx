"use client";

import { Restaurant } from "../../interfaces/restaurant";
import { useCart } from "../../context/CartContext";
import { useTableNavigation } from "../../hooks/useTableNavigation";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";

interface MenuHeaderProps {
  restaurant: Restaurant;
  tableNumber?: string;
}

export default function MenuHeader({
  restaurant,
  tableNumber,
}: MenuHeaderProps) {
  const { state: cartState } = useCart();
  const { navigateWithTable } = useTableNavigation();
  const pathname = usePathname();

  const handleCartClick = () => {
    navigateWithTable("/cart");
  };

  return (
    <header className="sticky top-0 container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 z-5">
      <div className="flex items-center justify-end z-10">
        <div className="flex items-center space-x-2 md:space-x-3 lg:space-x-4 z-10">
          <div className="relative group" id="cart-icon">
            <div
              onClick={handleCartClick}
              className="size-10 md:size-12 lg:size-14 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm shadow-sm hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer"
            >
              <ShoppingCart className="text-primary size-5 md:size-6 lg:size-7 group-hover:scale-105 transition-transform" />
            </div>
            {cartState.totalItems > 0 && (
              <div
                id="cart-badge"
                className="absolute -top-1 -right-1 bg-even-grass text-even-evergreen rounded-full size-4 md:size-5 lg:size-6 flex items-center justify-center text-xs md:text-sm font-normal"
              >
                {cartState.totalItems}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
