// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFlyToCart } from "./useFlyToCart";

describe("useFlyToCart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML =
      '<button id="add"></button><div id="cart-icon"></div><div id="cart-badge"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("avisa y no anima si no existe #cart-icon", () => {
    document.getElementById("cart-icon")!.remove();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onComplete = vi.fn();
    const { result } = renderHook(() => useFlyToCart());
    act(() =>
      result.current.flyToCart(document.getElementById("add")!, onComplete),
    );
    vi.runAllTimers();
    expect(warn).toHaveBeenCalledWith("Cart element not found");
    expect(onComplete).not.toHaveBeenCalled();
    expect(document.querySelector(".flying-to-cart")).toBeNull();
  });

  it("crea el círculo, lo quita al terminar, llama onComplete y anima el badge", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useFlyToCart({ speed: 100 }));
    act(() =>
      result.current.flyToCart(document.getElementById("add")!, onComplete),
    );
    expect(document.querySelector(".flying-to-cart")).not.toBeNull();

    act(() => vi.advanceTimersByTime(150));
    expect(document.querySelector(".flying-to-cart")).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(10));
    expect(
      document.getElementById("cart-badge")!.classList.contains(
        "cart-badge-animate",
      ),
    ).toBe(true);
  });
});
