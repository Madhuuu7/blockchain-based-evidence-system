import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * AuthProvider - and specifically the refresh bug.
 *
 * The cached role used to be read in a useEffect. Effects run *after* the
 * first render, so on a page reload ProtectedRoute saw role === null, decided
 * the user was signed out and redirected to /login. Pressing F5 logged you
 * out. The fix was to read localStorage in the useState initialiser, during
 * the first render.
 *
 * The first test here fails against the old implementation and passes against
 * the current one, which is the only reason it is worth having.
 */
const mockWeb3 = { address: null, connect: vi.fn(), signer: null };

vi.mock("../context/Web3Context.jsx", () => ({
  useWeb3: () => mockWeb3,
  Web3Provider: ({ children }) => children
}));

const mockApi = { post: vi.fn() };
vi.mock("../services/api.js", () => ({ default: mockApi }));

const { AuthProvider, useAuth } = await import("../context/AuthContext.jsx");

/**
 * Records the role seen on every render, newest last.
 *
 * Asserting on the DOM after render() cannot catch the refresh bug: render()
 * wraps its work in act(), which flushes effects before the assertion runs, so
 * a role set one render late still looks correct by the time anything is
 * queried. ProtectedRoute, by contrast, decides during that first render.
 * Capturing each render is what makes the difference visible.
 */
const renders = [];

function RoleProbe() {
  const { role } = useAuth();
  renders.push(role ?? "none");
  return <div data-testid="role">{role ?? "none"}</div>;
}

function SignInProbe() {
  const { role, signIn, signOut, authError, isAuthenticating } = useAuth();
  return (
    <div>
      <div data-testid="role">{role ?? "none"}</div>
      <div data-testid="error">{authError ?? ""}</div>
      <div data-testid="busy">{String(isAuthenticating)}</div>
      <button onClick={() => signIn().catch(() => {})}>sign in</button>
      <button onClick={signOut}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  mockWeb3.address = null;
  mockWeb3.signer = null;
  mockWeb3.connect = vi.fn();
  mockApi.post = vi.fn();
  renders.length = 0;
});

describe("AuthProvider session restore", () => {
  it("exposes the cached role on the very first render", () => {
    // The regression test for the F5 logout. Reading the cache in an effect
    // makes this first entry "none", and ProtectedRoute - which runs in that
    // same first render - redirects to /login before the role ever arrives.
    window.localStorage.setItem("evidence_system_role", "INVESTIGATOR");

    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>
    );

    expect(renders[0]).toBe("INVESTIGATOR");
  });

  it("never renders as signed-out before the cached session appears", () => {
    // Even one such render is enough to bounce the user to the login screen.
    window.localStorage.setItem("evidence_system_role", "ADMIN");

    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>
    );

    expect(renders).not.toContain("none");
  });

  it("reports no role when nothing is cached", () => {
    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });

  it("survives localStorage being unavailable instead of failing to render", () => {
    // Private browsing and blocked site data make the accessor throw. The app
    // should treat that as "not signed in", not crash on boot.
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });
});

describe("AuthProvider sign-in", () => {
  function arrangeSuccessfulSignIn(role = "OFFICER") {
    const signMessage = vi.fn().mockResolvedValue("0xsignature");
    mockWeb3.address = "0xabc";
    mockWeb3.signer = { signMessage };

    mockApi.post = vi.fn((url) => {
      if (url === "/auth/nonce") return Promise.resolve({ data: { message: "Nonce: abc123" } });
      return Promise.resolve({ data: { token: "jwt-token", role, address: "0xabc" } });
    });

    return { signMessage };
  }

  it("stores the token and role, and exposes the role", async () => {
    arrangeSuccessfulSignIn("JUDICIARY");

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });

    expect(window.localStorage.getItem("evidence_system_jwt")).toBe("jwt-token");
    expect(window.localStorage.getItem("evidence_system_role")).toBe("JUDICIARY");
    expect(screen.getByTestId("role")).toHaveTextContent("JUDICIARY");
  });

  it("signs the nonce the server issued, rather than a message of its own", async () => {
    const { signMessage } = arrangeSuccessfulSignIn();

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });

    expect(signMessage).toHaveBeenCalledWith("Nonce: abc123");
  });

  it("surfaces the server's error message when verification is refused", async () => {
    mockWeb3.address = "0xabc";
    mockWeb3.signer = { signMessage: vi.fn().mockResolvedValue("0xsig") };
    mockApi.post = vi.fn((url) => {
      if (url === "/auth/nonce") return Promise.resolve({ data: { message: "Nonce: abc123" } });
      return Promise.reject({ response: { data: { error: "Nonce invalid, expired, or already used" } } });
    });

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });

    expect(screen.getByTestId("error")).toHaveTextContent("Nonce invalid, expired, or already used");
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });

  it("stops showing as busy after a failure", async () => {
    mockWeb3.address = "0xabc";
    mockWeb3.signer = { signMessage: vi.fn().mockRejectedValue(new Error("User rejected")) };
    mockApi.post = vi.fn().mockResolvedValue({ data: { message: "Nonce: abc123" } });

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });

    expect(screen.getByTestId("busy")).toHaveTextContent("false");
  });

  it("does not store a session when the wallet refuses to sign", async () => {
    mockWeb3.address = "0xabc";
    mockWeb3.signer = { signMessage: vi.fn().mockRejectedValue(new Error("User rejected")) };
    mockApi.post = vi.fn().mockResolvedValue({ data: { message: "Nonce: abc123" } });

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign in").click();
    });

    expect(window.localStorage.getItem("evidence_system_jwt")).toBeNull();
  });
});

describe("AuthProvider sign-out", () => {
  it("clears both the token and the cached role", async () => {
    window.localStorage.setItem("evidence_system_jwt", "jwt-token");
    window.localStorage.setItem("evidence_system_role", "ADMIN");

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByText("sign out").click();
    });

    expect(window.localStorage.getItem("evidence_system_jwt")).toBeNull();
    expect(window.localStorage.getItem("evidence_system_role")).toBeNull();
    expect(screen.getByTestId("role")).toHaveTextContent("none");
  });
});

describe("useAuth", () => {
  it("refuses to be used outside an AuthProvider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<RoleProbe />)).toThrow(/must be used within an AuthProvider/);

    quiet.mockRestore();
  });
});
