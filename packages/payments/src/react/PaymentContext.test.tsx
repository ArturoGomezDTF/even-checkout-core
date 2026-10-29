// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaymentService } from "../payment-service";
import type { PaymentMethod } from "../types";
import { PaymentProvider, extractPaymentMethods, usePayment, type PaymentProviderProps } from "./PaymentContext";

const card = (id: string, isDefault = false): PaymentMethod => ({
  id,
  lastFourDigits: "4242",
  cardBrand: "visa",
  cardType: "credit",
  isDefault,
});

function mockService(methods: PaymentMethod[] = [card("a", true), card("b")]) {
  return {
    getPaymentMethods: vi.fn().mockResolvedValue({ success: true, data: { paymentMethods: methods } }),
    setDefaultPaymentMethod: vi.fn().mockResolvedValue({ success: true }),
    deletePaymentMethod: vi.fn().mockResolvedValue({ success: true }),
    migrateGuestPaymentMethods: vi.fn().mockResolvedValue({ success: true }),
  };
}

function setup(props: Partial<Omit<PaymentProviderProps, "children" | "service">> & { service?: ReturnType<typeof mockService> } = {}) {
  const service = props.service ?? mockService();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PaymentProvider
      userId={null}
      guestId={null}
      {...props}
      service={service as unknown as PaymentService}
    >
      {children}
    </PaymentProvider>
  );
  return { service, ...renderHook(() => usePayment(), { wrapper }) };
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("extractPaymentMethods", () => {
  it("acepta las tres formas de respuesta", () => {
    const list = [card("x")];
    expect(extractPaymentMethods({ paymentMethods: list })).toBe(list);
    expect(extractPaymentMethods({ data: { paymentMethods: list } })).toBe(list);
    expect(extractPaymentMethods({ data: list })).toBe(list);
    expect(extractPaymentMethods({ data: {} })).toEqual([]);
  });
});

describe("PaymentProvider", () => {
  it("sin usuario ni invitado no pide tarjetas", async () => {
    const { result, service } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(service.getPaymentMethods).not.toHaveBeenCalled();
    expect(result.current.hasPaymentMethods).toBe(false);
  });

  it("carga las tarjetas del invitado", async () => {
    const { result } = setup({ guestId: "g1" });
    await waitFor(() => expect(result.current.paymentMethods).toHaveLength(2));
  });

  it("avisa a la app cuando hay sesión de usuario", async () => {
    const onUserSession = vi.fn();
    const { result } = setup({ userId: "u1", onUserSession });
    await waitFor(() => expect(result.current.hasPaymentMethods).toBe(true));
    expect(onUserSession).toHaveBeenCalledWith("u1");
  });

  it("solo un usuario registrado puede marcar default", async () => {
    const { result } = setup({ guestId: "g1" });
    await expect(result.current.setDefaultPaymentMethod("b")).rejects.toThrow();
  });

  it("marca default", async () => {
    const { result } = setup({ userId: "u1" });
    await waitFor(() => expect(result.current.hasPaymentMethods).toBe(true));
    await act(() => result.current.setDefaultPaymentMethod("b"));
    expect(result.current.paymentMethods.map((pm) => pm.isDefault)).toEqual([false, true]);
  });

  it("borrado optimista que se restaura si el backend falla", async () => {
    const service = mockService();
    service.deletePaymentMethod.mockResolvedValue({ success: false, error: { message: "nope" } });
    const { result } = setup({ userId: "u1", service });
    await waitFor(() => expect(result.current.paymentMethods).toHaveLength(2));
    await act(async () => {
      await expect(result.current.deletePaymentMethod("a")).rejects.toThrow("nope");
    });
    expect(result.current.paymentMethods.map((pm) => pm.id).sort()).toEqual(["a", "b"]);
  });

  it("borra la tarjeta", async () => {
    const { result, service } = setup({ userId: "u1" });
    await waitFor(() => expect(result.current.paymentMethods).toHaveLength(2));
    await act(() => result.current.deletePaymentMethod("a"));
    expect(service.deletePaymentMethod).toHaveBeenCalledWith("a");
    expect(result.current.paymentMethods.map((pm) => pm.id)).toEqual(["b"]);
  });

  it("migra las tarjetas del invitado al iniciar sesión y borra el guest id", async () => {
    vi.useFakeTimers();
    localStorage.setItem("even-guest-id", "g1");
    const { service } = setup({ userId: "u1" });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(service.migrateGuestPaymentMethods).toHaveBeenCalledWith("g1");
    expect(localStorage.getItem("even-guest-id")).toBeNull();
  });

  it("no borra el guest id si la migración falla", async () => {
    vi.useFakeTimers();
    localStorage.setItem("even-guest-id", "g1");
    const service = mockService();
    service.migrateGuestPaymentMethods.mockResolvedValue({ success: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ userId: "u1", service });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(localStorage.getItem("even-guest-id")).toBe("g1");
  });

  it("con migrationDelayMs null no migra solo; la app la dispara", async () => {
    vi.useFakeTimers();
    localStorage.setItem("even-guest-id", "g1");
    const { service, result } = setup({ userId: "u1", migrationDelayMs: null });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(service.migrateGuestPaymentMethods).not.toHaveBeenCalled();
    await act(() => result.current.migrateGuestPaymentMethods());
    expect(service.migrateGuestPaymentMethods).toHaveBeenCalledWith("g1");
    expect(localStorage.getItem("even-guest-id")).toBeNull();
  });

  it("usePayment fuera del provider lanza", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePayment())).toThrow("PaymentProvider");
  });
});
