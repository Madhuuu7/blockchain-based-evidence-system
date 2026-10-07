import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * The wrong-network banner.
 *
 * This exists because "please switch to Sepolia" turned out to be advice that
 * could be followed correctly and still fail: MetaMask hides test networks by
 * default, and the toggle that reveals them has moved between versions. The
 * button asks the wallet to switch directly instead of describing where to
 * click.
 *
 * What is worth defending here is that it stays quiet when it should - a
 * banner that cries wolf before the wallet has even reported a chain is worse
 * than none - and that declining the prompt is treated as a choice rather than
 * an error.
 */
const mockWeb3 = {
  isWrongNetwork: false,
  chainId: null,
  expectedChainId: 11155111,
  switchNetwork: vi.fn()
};

vi.mock("../context/Web3Context.jsx", () => ({
  useWeb3: () => mockWeb3,
  Web3Provider: ({ children }) => children
}));

const NetworkBanner = (await import("../components/NetworkBanner.jsx")).default;

beforeEach(() => {
  mockWeb3.isWrongNetwork = false;
  mockWeb3.chainId = null;
  mockWeb3.expectedChainId = 11155111;
  mockWeb3.switchNetwork = vi.fn().mockResolvedValue(true);
});

describe("NetworkBanner", () => {
  it("renders nothing when the wallet is on the right network", () => {
    mockWeb3.chainId = 11155111;

    const { container } = render(<NetworkBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the wallet has reported a chain", () => {
    // Not connected yet is not the same as being on the wrong network, and
    // warning about it would be noise on every first page load.
    mockWeb3.chainId = null;
    mockWeb3.isWrongNetwork = false;

    const { container } = render(<NetworkBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("names both networks so the problem is self-explanatory", () => {
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 31337;

    render(<NetworkBanner />);

    expect(screen.getByText(/on Hardhat Local/)).toBeInTheDocument();
    expect(screen.getByText(/reads and writes on Sepolia/)).toBeInTheDocument();
  });

  it("offers a button naming the network it will switch to", () => {
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 1;

    render(<NetworkBanner />);

    expect(screen.getByRole("button", { name: /Switch to Sepolia/ })).toBeInTheDocument();
  });

  it("falls back to the chain ID for a network it has no name for", () => {
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 42161;

    render(<NetworkBanner />);

    expect(screen.getByText(/chain ID 42161/)).toBeInTheDocument();
  });

  it("asks the wallet to switch when the button is pressed", async () => {
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 31337;

    render(<NetworkBanner />);

    await act(async () => {
      screen.getByRole("button").click();
    });

    expect(mockWeb3.switchNetwork).toHaveBeenCalledTimes(1);
  });

  it("re-enables the button if the switch is declined", async () => {
    // Declining the MetaMask prompt is a decision, not a failure. Leaving the
    // button stuck on "Check MetaMask…" would strand the user.
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 31337;
    mockWeb3.switchNetwork = vi.fn().mockResolvedValue(false);

    render(<NetworkBanner />);

    await act(async () => {
      screen.getByRole("button").click();
    });

    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("re-enables the button if the wallet throws", async () => {
    mockWeb3.isWrongNetwork = true;
    mockWeb3.chainId = 31337;
    mockWeb3.switchNetwork = vi.fn().mockRejectedValue(new Error("wallet exploded"));

    render(<NetworkBanner />);

    await act(async () => {
      screen.getByRole("button").click();
    });

    expect(screen.getByRole("button")).not.toBeDisabled();
  });
});
