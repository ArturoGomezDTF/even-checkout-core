import { describe, expect, it } from "vitest";
import { isDefinitiveWalletRejection } from "./wallet";

describe("isDefinitiveWalletRejection", () => {
  it.each([
    [{ status: 400, code: "validation_error" }, true],
    [{ status: 422, error: { code: "payment_rejected" } }, true],
    [{ status: 400 }, false],
    [{ status: 408, code: "timeout" }, false],
    [{ status: 429, code: "rate_limited" }, false],
    [{ status: 500, code: "internal" }, false],
    [{ status: 502, code: "bad_gateway" }, false],
    [{ code: "network" }, false],
  ])("%j → %s", (result, expected) => {
    expect(isDefinitiveWalletRejection(result)).toBe(expected);
  });
});
