import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useWeb3 } from "../context/Web3Context.jsx";

export default function Login() {
  const { signIn, authError, isAuthenticating } = useAuth();
  const { connectError } = useWeb3();
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
    <div className="min-h-screen flex items-center justify-center bg-navy-950">
      <div className="w-full max-w-md bg-navy-900 border border-navy-700 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-100">Cyber Crime Evidence System</h1>
        <p className="text-sm text-slate-400 mt-2">
          Sign in with your wallet. Your role (Admin, Officer, Investigator, Judiciary) is
          verified directly against the smart contract — it is never taken from local storage
          or the frontend.
        </p>

        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="mt-6 w-full py-3 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-60 font-medium"
        >
          {isAuthenticating ? "Waiting for signature..." : "Connect Wallet & Sign In"}
        </button>

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
