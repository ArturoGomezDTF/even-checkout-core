import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input, Textarea } from "./field";

describe("Input", () => {
  it("asocia el label con el campo", () => {
    render(<Input label="Nombre" />);
    expect(screen.getByLabelText("Nombre").tagName).toBe("INPUT");
  });

  it("marca el campo inválido y lo describe con el error", () => {
    render(<Input label="Correo" error="Correo inválido" hint="Te enviaremos el ticket" />);
    const input = screen.getByLabelText("Correo");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(message?.textContent).toBe("Correo inválido");
    expect(screen.queryByText("Te enviaremos el ticket")).toBeNull();
  });

  it("respeta un id propio", () => {
    render(<Input id="phone" label="Teléfono" hint="10 dígitos" />);
    const input = screen.getByLabelText("Teléfono");
    expect(input.id).toBe("phone");
    expect(input.getAttribute("aria-describedby")).toBe("phone-message");
  });
});

describe("Textarea", () => {
  it("asocia el label con el campo", () => {
    render(<Textarea label="Notas" />);
    expect(screen.getByLabelText("Notas").tagName).toBe("TEXTAREA");
  });
});
