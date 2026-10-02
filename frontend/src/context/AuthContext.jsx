import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { useWeb3 } from "./Web3Context.jsx";
import api from "../services/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { address, connect, signer } = useWeb3();

  // Read synchronously during the first render, not in an effect.
  //
  // An effect runs after that first render, so ProtectedRoute saw role === null
  // and redirected to /login before the cached role ever arrived - meaning a
  // signed-in user was thrown back to the login screen by nothing more than a
  // page refresh.
  const [role, setRole] = useState(() => {
    try {
      return localStorage.getItem("evidence_system_role");
    } catch {
      return null;
    }
  });

  const [authError, setAuthError] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const signIn = useCallback(async () => {
  setAuthError(null);
  setIsAuthenticating(true);

  try {
    const walletAddress = address || (await connect());

    if (!walletAddress) {
      throw new Error("Wallet connection required");
    }

    // React state may not have updated yet after connect().
    // Get the signer directly from MetaMask.
    const currentSigner =
      signer || await new BrowserProvider(window.ethereum).getSigner();

    if (!currentSigner) {
      throw new Error("Signer unavailable — reconnect your wallet");
    }

    const { data: nonceData } = await api.post("/auth/nonce", {
      address: walletAddress
    });

    const signature = await currentSigner.signMessage(nonceData.message);

    const { data: verifyData } = await api.post("/auth/verify", {
      address: walletAddress,
      signature,
      message: nonceData.message
    });

    localStorage.setItem("evidence_system_jwt", verifyData.token);
    localStorage.setItem("evidence_system_role", verifyData.role);

    setRole(verifyData.role);

    return verifyData.role;
  } catch (err) {
    setAuthError(err.response?.data?.error || err.message);
    throw err;
  } finally {
    setIsAuthenticating(false);
  }
}, [address, connect, signer]);
  const signOut = useCallback(() => {
    localStorage.removeItem("evidence_system_jwt");
    localStorage.removeItem("evidence_system_role");
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ role, signIn, signOut, authError, isAuthenticating }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
