import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * ProtectedRoute is UX, not security - the backend re-derives the role from
 * the contract on every request and the contract enforces it again on every
 * write. What these tests defend is that the guard sends people somewhere
 * sensible, and in particular that a restored session is not mistaken for a
 * signed-out one.
 */
const mockAuth = { role: null };

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }) => children
}));

const ProtectedRoute = (await import("../components/ProtectedRoute.jsx")).default;

function renderAt(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login screen</div>} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
        <Route path="/evidence/upload" element={element} />
        <Route path="/alerts" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("sends a signed-out visitor to the login screen", () => {
    mockAuth.role = null;

    renderAt(
      "/alerts",
      <ProtectedRoute>
        <div>alert feed</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("login screen")).toBeInTheDocument();
    expect(screen.queryByText("alert feed")).not.toBeInTheDocument();
  });

  it("renders the page for a signed-in user when no roles are specified", () => {
    mockAuth.role = "OFFICER";

    renderAt(
      "/alerts",
      <ProtectedRoute>
        <div>alert feed</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("alert feed")).toBeInTheDocument();
  });

  it("renders the page when the role is one of the permitted ones", () => {
    mockAuth.role = "OFFICER";

    renderAt(
      "/evidence/upload",
      <ProtectedRoute allowedRoles={["OFFICER"]}>
        <div>upload form</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("upload form")).toBeInTheDocument();
  });

  it("sends a signed-in user with the wrong role to the dashboard, not to login", () => {
    // Being signed in but unauthorised is a different situation from being
    // signed out, and bouncing to /login would invite a pointless re-login.
    mockAuth.role = "JUDICIARY";

    renderAt(
      "/evidence/upload",
      <ProtectedRoute allowedRoles={["OFFICER"]}>
        <div>upload form</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByText("upload form")).not.toBeInTheDocument();
  });

  it("admits any one of several permitted roles", () => {
    for (const role of ["INVESTIGATOR", "JUDICIARY", "ADMIN"]) {
      mockAuth.role = role;

      const { unmount } = renderAt(
        "/alerts",
        <ProtectedRoute allowedRoles={["INVESTIGATOR", "JUDICIARY", "ADMIN"]}>
          <div>verification page</div>
        </ProtectedRoute>
      );

      expect(screen.getByText("verification page"), `${role} should be admitted`).toBeInTheDocument();
      unmount();
    }
  });

  it("treats a restored session as signed in", () => {
    // The refresh bug surfaced here: a role restored from localStorage arrived
    // one render too late and this guard had already redirected.
    mockAuth.role = "ADMIN";

    renderAt(
      "/alerts",
      <ProtectedRoute allowedRoles={["ADMIN"]}>
        <div>alert feed</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("alert feed")).toBeInTheDocument();
  });

  it("does not admit a wallet whose role is NONE", () => {
    // The contract's zero value. It is a role string, so a careless truthiness
    // check would let it through.
    mockAuth.role = "NONE";

    renderAt(
      "/alerts",
      <ProtectedRoute allowedRoles={["ADMIN", "OFFICER", "INVESTIGATOR", "JUDICIARY"]}>
        <div>alert feed</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText("alert feed")).not.toBeInTheDocument();
  });
});
