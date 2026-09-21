import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EvidenceList from "./pages/EvidenceList.jsx";
import EvidenceUpload from "./pages/EvidenceUpload.jsx";
import EvidenceDetail from "./pages/EvidenceDetail.jsx";
import Cases from "./pages/Cases.jsx";
import Alerts from "./pages/Alerts.jsx";
import Users from "./pages/Users.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      <Route path="/evidence" element={<ProtectedRoute><EvidenceList /></ProtectedRoute>} />
      <Route
        path="/evidence/upload"
        element={
          <ProtectedRoute allowedRoles={["OFFICER"]}>
            <EvidenceUpload />
          </ProtectedRoute>
        }
      />
      {/* /evidence/:id/history and /evidence/:id/verify are implemented as
          tabs/actions within the same detail view rather than separate
          routes, since they share the same evidence + custody data. */}
      <Route path="/evidence/:id" element={<ProtectedRoute><EvidenceDetail /></ProtectedRoute>} />
      <Route path="/evidence/:id/history" element={<ProtectedRoute><EvidenceDetail /></ProtectedRoute>} />
      <Route path="/evidence/:id/verify" element={<ProtectedRoute><EvidenceDetail /></ProtectedRoute>} />

      <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
      <Route path="/cases/:caseId" element={<ProtectedRoute><Cases /></ProtectedRoute>} />

      <Route
        path="/alerts"
        element={
          <ProtectedRoute allowedRoles={["ADMIN"]}>
            <Alerts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={["ADMIN"]}>
            <Users />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
