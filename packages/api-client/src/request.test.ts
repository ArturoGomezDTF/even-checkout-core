import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./request";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<
    string,
    string
  >;
}

describe("createApiClient", () => {
  it("manda el token de auth y devuelve el cuerpo tal cual en 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: { ok: 1 } }),
    );
    const request = createApiClient({
      baseUrl: "https://api.test",
      getAuthToken: () => "tok",
      getGuestId: () => "guest",
      fetch: fetchMock,
    });

    const res = await request<{ ok: number }>("/x", { method: "GET" });

    expect(res).toEqual({ success: true, data: { ok: 1 } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/x");
    expect(headersOf(fetchMock)).toMatchObject({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
    });
    expect(headersOf(fetchMock)["x-guest-id"]).toBeUndefined();
  });

  it("usa x-guest-id cuando no hay token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    const request = createApiClient({
      baseUrl: "",
      getAuthToken: () => null,
      getGuestId: () => "guest-1",
      fetch: fetchMock,
    });

    await request("/x");

    expect(headersOf(fetchMock)["x-guest-id"]).toBe("guest-1");
    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("refresca el token en 401 y reintenta una vez", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { success: false }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const refreshToken = vi.fn().mockResolvedValue("nuevo");
    const request = createApiClient({
      baseUrl: "",
      getAuthToken: () => "viejo",
      refreshToken,
      fetch: fetchMock,
    });

    const res = await request("/x");

    expect(res.success).toBe(true);
    expect(refreshToken).toHaveBeenCalledOnce();
    expect(headersOf(fetchMock, 1).Authorization).toBe("Bearer nuevo");
  });

  it("devuelve sesión expirada si el refresh falla, sin reintentar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    const request = createApiClient({
      baseUrl: "",
      getAuthToken: () => "viejo",
      refreshToken: async () => null,
      fetch: fetchMock,
    });

    const res = await request("/x");

    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/Sesión expirada/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("normaliza error string + code raíz (AppError) e incluye el status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, { success: false, error: "En curso", code: "payment_in_progress" }),
    );
    const request = createApiClient({ baseUrl: "", getAuthToken: () => null, fetch: fetchMock });

    const res = await request("/payments");

    expect(res).toEqual({
      success: false,
      error: { message: "En curso", code: "payment_in_progress" },
      code: "payment_in_progress",
      message: undefined,
      status: 409,
    });
  });

  it("conserva el error objeto de rutas legadas y le agrega el code raíz", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        success: false,
        code: "validation_error",
        error: { type: "validation_error", message: "Mal" },
      }),
    );
    const request = createApiClient({ baseUrl: "", getAuthToken: () => null, fetch: fetchMock });

    const res = await request("/x");

    expect(res.error).toEqual({
      code: "validation_error",
      type: "validation_error",
      message: "Mal",
    });
    expect(res.status).toBe(400);
  });

  it("convierte un fallo de red en respuesta de error sin lanzar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const request = createApiClient({ baseUrl: "", getAuthToken: () => null, fetch: fetchMock });

    const res = await request("/x");

    expect(res).toEqual({ success: false, error: { message: "offline" } });
  });
});
