import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { IconButton } from "./icon-button";

describe("Button", () => {
  it("es type=button por defecto para no enviar formularios", () => {
    render(<Button>Pagar</Button>);
    expect(screen.getByRole("button", { name: "Pagar" })).toHaveProperty("type", "button");
  });

  it("se desactiva y marca aria-busy mientras carga", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Pagar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Pagar" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("acepta className para sobrescribir estilos", () => {
    render(<Button className="bg-even-evergreen">Pagar</Button>);
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("bg-even-evergreen");
    expect(classes).not.toContain("bg-even-grass");
  });
});

describe("IconButton", () => {
  it("expone su aria-label como nombre", () => {
    render(<IconButton aria-label="Cerrar">x</IconButton>);
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });
});
