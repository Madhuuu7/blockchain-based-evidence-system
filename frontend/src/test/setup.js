import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Shared setup for the component tests.
 *
 * jsdom gives each test file one window that persists between tests, so
 * localStorage written by one test is still there for the next. Several of
 * these tests turn on whether a cached session is present at first render -
 * exactly the thing the refresh bug was about - so the store is cleared
 * between them rather than left to leak.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
