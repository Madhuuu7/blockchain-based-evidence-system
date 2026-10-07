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

  // Which wallet this session was issued to. Without it, switching accounts in
  // MetaMask left the previous session in place: the sidebar kept showing the
  // old role and every request still carried the old wallet's token, so the
  // interface said one thing and the API was doing another.
  const [sessionAddress, setSessionAddress] = useState(() => {
    try {
      return localStorage.getItem("evidence_system_address");
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
    localStorage.setItem("evidence_system_address", verifyData.address);

    setSessionAddress(verifyData.address);
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
    localStorage.removeItem("evidence_system_address");
    setSessionAddress(null);
    setRole(null);
  }, []);

  // End the session the moment the wallet changes to a different account.
  //
  // The session proves one specific wallet signed a challenge, so it stops
  // meaning anything as soon as the user is holding a different wallet.
  // Leaving it in place let someone act as the previous account - with its
  // role and its token - while MetaMask displayed another, which is both
  // confusing and wrong. Signing out sends them back to the login screen to
  // prove ownership of the new account instead.
  useEffect(() => {
    if (!address || !sessionAddress) return;

    if (address.toLowerCase() !== sessionAddress.toLowerCase()) {
      signOut();
    }
  }, [address, sessionAddress, signOut]);

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
