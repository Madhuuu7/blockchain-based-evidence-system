import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import api from "../services/api.js";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterResolved, setFilterResolved] = useState("all"); // 'all', 'unresolved', 'resolved'
  const [filterType, setFilterType] = useState("all");
  const [resolvingId, setResolvingId] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const params = {};
      if (filterResolved === "unresolved") params.resolved = "false";
      if (filterResolved === "resolved") params.resolved = "true";
      if (filterType !== "all") params.type = filterType;

      const { data } = await api.get("/alerts", { params });
      setAlerts(data.results || []);
    } catch (err) {
      console.error("Failed to load alerts:", err);
      setError(err.response?.data?.error || "Failed to load alerts from backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // 5s interval for responsive alerts
    return () => clearInterval(interval);
  }, [filterResolved, filterType]);

  const resolve = async (id) => {
    try {
      setResolvingId(id);
      await api.post(`/alerts/${id}/resolve`);
      await load();
    } catch (err) {
      console.error("Failed to resolve alert:", err);
      setError(err.response?.data?.error || "Failed to mark alert as resolved");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Layout>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ocean-900">Unauthorized Access & Integrity Alerts</h1>
          <p className="text-xs text-slate-600 mt-1">
            Real-time security alerts captured by the blockchain event listener and verification system.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterResolved}
            onChange={(e) => setFilterResolved(e.target.value)}
            className="bg-white border border-ocean-200 rounded px-3 py-1.5 text-xs text-ocean-900"
          >
            <option value="all">All Statuses</option>
            <option value="unresolved">Unresolved Only</option>
            <option value="resolved">Resolved Only</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-white border border-ocean-200 rounded px-3 py-1.5 text-xs text-ocean-900"
          >
            <option value="all">All Types</option>
            <option value="AccessDenied">Access Denied</option>
            <option value="IntegrityViolation">Integrity Violation</option>
          </select>

          <button
            onClick={load}
            className="bg-white hover:bg-ocean-100 border border-ocean-200 rounded px-3 py-1.5 text-xs text-ocean-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded p-3">
          {error}
        </div>
      )}

      {loading && alerts.length === 0 && (
        <div className="text-sm text-slate-600 py-8 text-center bg-white border border-ocean-200 rounded-xl">
          Loading alerts...
        </div>
      )}

      <div className="space-y-3">
        {alerts.map((a) => (
          <div
            key={a._id}
            className={`border rounded-xl p-4 flex flex-col md:flex-row justify-between items-start gap-4 transition ${
              a.resolved
                ? "bg-white/60 border-ocean-200 opacity-80"
                : "bg-white border-ocean-200 shadow-sm"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge tone={a.type === "AccessDenied" ? "error" : "pending"}>{a.type}</StatusBadge>
                {a.resolved ? (
                  <StatusBadge tone="success">Resolved ✓</StatusBadge>
                ) : (
                  <span className="text-xs text-amber-400 font-medium bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">
                    Action Required
                  </span>
                )}
              </div>
              <p className="text-sm text-ocean-900 mt-2 font-medium">{a.message}</p>
              <div className="text-xs text-slate-600 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <div>
                  <span className="text-slate-500">Wallet:</span>{" "}
                  <span className="font-mono text-ocean-700 break-all">{a.walletAddress || "N/A"}</span>
                </div>
                {a.evidenceId && (
                  <div>
                    <span className="text-slate-500">Evidence ID:</span>{" "}
                    <span className="font-semibold text-accent-700">#{a.evidenceId}</span>
                  </div>
                )}
                {a.txHash && (
                  <div>
                    <span className="text-slate-500">Tx:</span>{" "}
                    <span className="font-mono text-slate-600 break-all">{a.txHash.slice(0, 16)}...</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Timestamp:</span>{" "}
                  <span>{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {!a.resolved && (
              <button
                onClick={() => resolve(a._id)}
                disabled={resolvingId === a._id}
                className="whitespace-nowrap text-xs bg-accent-600 hover:bg-accent-700 disabled:opacity-50 rounded px-4 py-2 font-medium shadow-sm transition self-end md:self-center text-white"
              >
                {resolvingId === a._id ? "Resolving..." : "Mark Resolved"}
              </button>
            )}
          </div>
        ))}

        {!loading && alerts.length === 0 && (
          <div className="text-sm text-slate-500 py-12 text-center bg-white border border-ocean-200 rounded-xl">
            No alerts found matching the selected filter.
          </div>
        )}
      </div>
    </Layout>
  );
}
