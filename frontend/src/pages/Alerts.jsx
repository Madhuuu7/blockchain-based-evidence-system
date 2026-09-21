import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import api from "../services/api.js";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);

  const load = async () => {
    const { data } = await api.get("/alerts");
    setAlerts(data.results);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // light polling for near-real-time alerts
    return () => clearInterval(interval);
  }, []);

  const resolve = async (id) => {
    await api.post(`/alerts/${id}/resolve`);
    load();
  };

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-slate-100 mb-6">Unauthorized Access & Integrity Alerts</h1>

      <div className="space-y-3">
        {alerts.map((a) => (
          <div key={a._id} className="bg-navy-900 border border-navy-700 rounded-xl p-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge tone="error">{a.type}</StatusBadge>
                {a.resolved && <StatusBadge tone="success">Resolved</StatusBadge>}
              </div>
              <p className="text-sm text-slate-300 mt-2">{a.message}</p>
              <div className="text-xs text-slate-500 mt-1">
                {a.walletAddress} · Evidence #{a.evidenceId} · {new Date(a.createdAt).toLocaleString()}
              </div>
            </div>
            {!a.resolved && (
              <button onClick={() => resolve(a._id)} className="text-xs bg-navy-800 hover:bg-navy-700 rounded px-3 py-1.5">
                Mark Resolved
              </button>
            )}
          </div>
        ))}
        {alerts.length === 0 && <div className="text-sm text-slate-500">No alerts.</div>}
      </div>
    </Layout>
  );
}
