import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

describe("Modal", () => {
  it("no renderiza nada cerrado", () => {
    render(<Modal open={false} onClose={() => {}} title="Agotado" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza un diálogo con nombre en un portal del body", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Agotado" description="Elige otro platillo" />,
    );
    const dialog = screen.getByRole("dialog", { name: "Agotado" });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("bloquea el scroll mientras está abierto", () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="Agotado" />);
    expect(document.body.style.position).toBe("fixed");
    rerender(<Modal open={false} onClose={() => {}} title="Agotado" />);
    expect(document.body.style.position).toBe("");
  });

  it("cierra con Escape y al tocar el fondo, pero no al tocar el panel", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Agotado" />);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("no se cierra si dismissible es false", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Procesando pago" dismissible={false} />);
    fireEvent.click(screen.getByTestId("modal-overlay"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("devuelve el foco al elemento que lo abrió", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<Modal open onClose={() => {}} title="Agotado" />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    rerender(<Modal open={false} onClose={() => {}} title="Agotado" />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
