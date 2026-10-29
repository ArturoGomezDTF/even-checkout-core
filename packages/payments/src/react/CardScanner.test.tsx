// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_SCANNER_MESSAGES, CardScanner } from "./CardScanner";

const stop = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

beforeEach(() => {
  stop.mockClear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CardScanner", () => {
  it("escanea con la función inyectada y apaga la cámara", async () => {
    const onScanSuccess = vi.fn();
    const scan = vi.fn().mockResolvedValue({ cardNumber: "1", expiryDate: "01/30", cardholderName: "X" });
    render(<CardScanner onScanSuccess={onScanSuccess} onClose={() => {}} scan={scan} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: CARD_SCANNER_MESSAGES.es.title }));
    });
    expect(scan).toHaveBeenCalledOnce();
    expect(onScanSuccess).toHaveBeenCalledWith({ cardNumber: "1", expiryDate: "01/30", cardholderName: "X" });
    expect(stop).toHaveBeenCalled();
  });

  it("muestra el error de escaneo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const scan = vi.fn().mockRejectedValue(new Error("x"));
    render(
      <CardScanner onScanSuccess={() => {}} onClose={() => {}} scan={scan} labels={CARD_SCANNER_MESSAGES.en} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scan Card" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(CARD_SCANNER_MESSAGES.en.errorScan);
  });

  it("muestra el error de cámara", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error("denied"));
    render(<CardScanner onScanSuccess={() => {}} onClose={() => {}} />);
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toBe(CARD_SCANNER_MESSAGES.es.errorCameraAccess);
  });

  it("cerrar apaga la cámara", async () => {
    const onClose = vi.fn();
    render(<CardScanner onScanSuccess={() => {}} onClose={onClose} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
