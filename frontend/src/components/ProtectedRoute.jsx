import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Route guard for the UI only — this is convenience/UX, NOT security.
// Every actual data request still goes through the backend, which
// re-derives role from the smart contract, and every state-changing chain
// call is independently enforced by EvidenceRegistry.sol's require()s.
export default function ProtectedRoute({ allowedRoles, children }) {
  const { role } = useAuth();

  if (!role) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
