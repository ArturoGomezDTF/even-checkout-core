import { describe, expect, it } from "vitest";
import { getBackendOrigin } from "./origin";

const FALLBACK = "https://fallback.test";

describe("getBackendOrigin", () => {
  it("quita el sufijo /api", () => {
    expect(getBackendOrigin("https://backend.test/api", FALLBACK)).toBe(
      "https://backend.test",
    );
  });

  it("quita /api con trailing slash", () => {
    expect(getBackendOrigin("https://backend.test/api/", FALLBACK)).toBe(
      "https://backend.test",
    );
  });

  it("acepta URL sin /api", () => {
    expect(getBackendOrigin("https://backend.test", FALLBACK)).toBe(
      "https://backend.test",
    );
    expect(getBackendOrigin("https://backend.test/", FALLBACK)).toBe(
      "https://backend.test",
    );
  });

  it("no rompe hosts que empiezan o contienen 'api'", () => {
    expect(getBackendOrigin("https://api.algo.com/api", FALLBACK)).toBe(
      "https://api.algo.com",
    );
    expect(getBackendOrigin("https://api.algo.com", FALLBACK)).toBe(
      "https://api.algo.com",
    );
    expect(getBackendOrigin("https://myapi.example.com/api/", FALLBACK)).toBe(
      "https://myapi.example.com",
    );
  });

  it("conserva el puerto", () => {
    expect(getBackendOrigin("http://localhost:5000/api", FALLBACK)).toBe(
      "http://localhost:5000",
    );
  });

  it("devuelve el fallback si está vacía, indefinida o es inválida", () => {
    expect(getBackendOrigin(undefined, FALLBACK)).toBe(FALLBACK);
    expect(getBackendOrigin("", FALLBACK)).toBe(FALLBACK);
    expect(getBackendOrigin("not a url", FALLBACK)).toBe(FALLBACK);
    expect(getBackendOrigin("api.algo.com/api", FALLBACK)).toBe(FALLBACK);
  });

  it("devuelve el fallback si el protocolo no es http(s)", () => {
    expect(getBackendOrigin("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
    expect(getBackendOrigin("ftp://backend.test/api", FALLBACK)).toBe(FALLBACK);
  });
});
