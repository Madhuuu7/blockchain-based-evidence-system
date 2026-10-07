import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The axios instance carries the session token on every request and drops it
 * when the server says it is no longer valid. Both interceptors are tested by
 * running them directly, which is what axios does with them.
 */
let api;

beforeEach(async () => {
  vi.resetModules();
  window.localStorage.clear();
  api = (await import("../services/api.js")).default;
});

/** Pulls the handlers axios registered, so the real functions are exercised. */
function interceptors() {
  const request = api.interceptors.request.handlers[0];
  const response = api.interceptors.response.handlers[0];
  return { onRequest: request.fulfilled, onResponseError: response.rejected };
}

describe("request interceptor", () => {
  it("attaches the stored token as a Bearer header", () => {
    window.localStorage.setItem("evidence_system_jwt", "a-token");
    const { onRequest } = interceptors();

    const config = onRequest({ headers: {} });

    expect(config.headers.Authorization).toBe("Bearer a-token");
  });

  it("sends no Authorization header when there is no session", () => {
    const { onRequest } = interceptors();

    const config = onRequest({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it("leaves the rest of the request config alone", () => {
    window.localStorage.setItem("evidence_system_jwt", "a-token");
    const { onRequest } = interceptors();

    const config = onRequest({ headers: { "Content-Type": "application/json" }, url: "/evidence" });

    expect(config.url).toBe("/evidence");
    expect(config.headers["Content-Type"]).toBe("application/json");
  });
});

describe("response interceptor", () => {
  it("discards the token when the server rejects it with 401", async () => {
    // A token the server will not accept is worse than no token: it keeps the
    // UI believing there is a session.
    window.localStorage.setItem("evidence_system_jwt", "expired-token");
    const { onResponseError } = interceptors();

    await expect(onResponseError({ response: { status: 401 } })).rejects.toBeTruthy();
    expect(window.localStorage.getItem("evidence_system_jwt")).toBeNull();
  });

  it("keeps the token on a 403, which means authenticated but not permitted", async () => {
    window.localStorage.setItem("evidence_system_jwt", "valid-token");
    const { onResponseError } = interceptors();

    await expect(onResponseError({ response: { status: 403 } })).rejects.toBeTruthy();
    expect(window.localStorage.getItem("evidence_system_jwt")).toBe("valid-token");
  });

  it("keeps the token when the request failed without a response at all", async () => {
    // A network failure says nothing about whether the session is still good.
    window.localStorage.setItem("evidence_system_jwt", "valid-token");
    const { onResponseError } = interceptors();

    await expect(onResponseError({ message: "Network Error" })).rejects.toBeTruthy();
    expect(window.localStorage.getItem("evidence_system_jwt")).toBe("valid-token");
  });

  it("re-rejects so the caller still sees the failure", async () => {
    const { onResponseError } = interceptors();
    const error = { response: { status: 401 } };

    await expect(onResponseError(error)).rejects.toBe(error);
  });
});
