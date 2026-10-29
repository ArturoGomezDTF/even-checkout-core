import { useCallback } from "react";

interface FlyToCartOptions {
  speed?: number;
  curveDelay?: number;
}

export const useFlyToCart = ({
  speed = 250,
  curveDelay = 150,
}: FlyToCartOptions = {}) => {
  const flyToCart = useCallback(
    (buttonElement: HTMLElement, onComplete?: () => void) => {
      const cart = document.querySelector("#cart-icon");
      if (!cart) {
        console.warn("Cart element not found");
        return;
      }

      const btnRect = buttonElement.getBoundingClientRect();
      const cartRect = cart.getBoundingClientRect();

      // Create red circle
      const flyingCircle = document.createElement("div");

      // Add flying button class
      flyingCircle.classList.add("flying-to-cart");

      // Set initial position and styles for red circle
      flyingCircle.style.position = "fixed";
      flyingCircle.style.top = `${btnRect.top + btnRect.height / 2 - 15}px`;
      flyingCircle.style.left = `${btnRect.left + btnRect.width / 2 - 15}px`;
      flyingCircle.style.width = "15px";
      flyingCircle.style.height = "15px";
      flyingCircle.style.backgroundColor = "#82E657";
      flyingCircle.style.borderRadius = "50%";
      flyingCircle.style.opacity = "1";
      flyingCircle.style.zIndex = "9999";
      flyingCircle.style.pointerEvents = "none";
      flyingCircle.style.transition = `width ${speed / 1000}s ease, height ${speed / 1000}s ease, top ${
        (speed + curveDelay) / 1000
      }s ease, left ${speed / 1000}s ease, transform ${speed / 1000}s ease ${
        (speed - 10) / 1000
      }s, opacity ${(speed * 1.6) / 1000}s ease`;

      document.body.appendChild(flyingCircle);

      // Trigger animation
      requestAnimationFrame(() => {
        flyingCircle.style.top = `${cartRect.top + cartRect.height / 2}px`;
        flyingCircle.style.left = `${cartRect.left + cartRect.width / 2}px`;
        flyingCircle.style.width = "10px";
        flyingCircle.style.height = "10px";
        flyingCircle.style.transform = "scale(0)";
        // flyingCircle.style.opacity = "0";
      });

      // Remove after animation and trigger badge animation
      setTimeout(() => {
        flyingCircle.remove();

        // Call onComplete callback to update cart
        if (onComplete) {
          onComplete();
        }

        // Trigger cart badge animation after a small delay
        setTimeout(() => {
          const cartBadge = document.querySelector("#cart-badge");
          if (cartBadge) {
            cartBadge.classList.remove("cart-badge-animate");
            // Force reflow to restart animation
            void cartBadge.getBoundingClientRect();
            cartBadge.classList.add("cart-badge-animate");
          }
        }, 10);
      }, speed * 1.5);
    },
    [speed, curveDelay],
  );

  return { flyToCart };
};
