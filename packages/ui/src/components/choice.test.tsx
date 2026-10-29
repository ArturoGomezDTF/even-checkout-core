import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox, Radio } from "./choice";

describe("Checkbox", () => {
  it("se marca al tocar su label", () => {
    render(<Checkbox label="Sin cebolla" />);
    const checkbox = screen.getByRole("checkbox", { name: "Sin cebolla" }) as HTMLInputElement;
    fireEvent.click(screen.getByText("Sin cebolla"));
    expect(checkbox.checked).toBe(true);
  });
});

describe("Radio", () => {
  it("solo uno del grupo queda marcado", () => {
    render(
      <>
        <Radio name="size" value="s" label="Chico" />
        <Radio name="size" value="l" label="Grande" />
      </>,
    );
    const small = screen.getByRole("radio", { name: "Chico" }) as HTMLInputElement;
    const large = screen.getByRole("radio", { name: "Grande" }) as HTMLInputElement;
    fireEvent.click(small);
    fireEvent.click(large);
    expect(small.checked).toBe(false);
    expect(large.checked).toBe(true);
  });
});
