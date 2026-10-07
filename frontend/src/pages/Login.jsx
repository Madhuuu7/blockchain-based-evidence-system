import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useWeb3 } from "../context/Web3Context.jsx";
import NetworkBanner from "../components/NetworkBanner.jsx";

export default function Login() {
  const { signIn, authError, isAuthenticating } = useAuth();
  const { connectError, address, requestAccountChange } = useWeb3();
  const navigate = useNavigate();

  const handleSignIn = async () => {
    try {
      await signIn();
      navigate("/dashboard");
    } catch {
      // error already surfaced via authError
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ocean-50">
      <div className="w-full max-w-md bg-white border border-ocean-200 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-ocean-900">Cyber Crime Evidence System</h1>
        <p className="text-sm text-slate-600 mt-2">
          Sign in with your wallet. Your role (Admin, Officer, Investigator, Judiciary) is
          verified directly against the smart contract — it is never taken from local storage
          or the frontend.
        </p>

        <div className="mt-6">
          <NetworkBanner />
        </div>

        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="mt-6 w-full py-3 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-60 font-medium text-white"
        >
          {isAuthenticating ? "Waiting for signature..." : "Connect Wallet & Sign In"}
        </button>

        {address && (
          // Changing the active account in MetaMask does not grant this site
          // access to it - permission is per account - so without this the app
          // keeps signing in as whichever account was connected first, however
          // many times the user switches.
          <div className="mt-3 text-center text-xs text-slate-500">
            <span>
              Will sign in as{" "}
              <span className="font-mono text-ocean-700">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </span>
            <button
              onClick={requestAccountChange}
              className="ml-2 text-accent-700 underline hover:text-accent-800"
            >
              Use a different account
            </button>
          </div>
        )}

        {(authError || connectError) && (
          <div className="mt-4 text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded p-3">
            {authError || connectError}
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500">
          No transaction fee is charged for signing in — this only signs a message to prove
          wallet ownership.
        </p>
      </div>
    </div>
  );
}
