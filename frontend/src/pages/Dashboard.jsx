import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-ocean-200 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-ocean-900 mt-2">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  const [stats, setStats] = useState({ evidence: 0, cases: 0, users: 0, alerts: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const [evidenceRes, casesRes] = await Promise.all([
          api.get("/evidence", { params: { limit: 1 } }),
          api.get("/cases", { params: { limit: 1 } })
        ]);
        const next = { evidence: evidenceRes.data.total, cases: casesRes.data.total, users: 0, alerts: 0 };

        if (role === "ADMIN") {
          const [usersRes, alertsRes] = await Promise.all([
            api.get("/users"),
            api.get("/alerts", { params: { resolved: "false" } })
          ]);
          next.users = usersRes.data.results.length;
          next.alerts = alertsRes.data.total;
        }
        setStats(next);
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      }
    }
    loadStats();
  }, [role]);

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-ocean-900 mb-6">
        {role} Dashboard
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Evidence" value={stats.evidence} />
        <StatCard label="Total Cases" value={stats.cases} />
        {role === "ADMIN" && <StatCard label="Registered Users" value={stats.users} />}
        {role === "ADMIN" && <StatCard label="Open Alerts" value={stats.alerts} />}
      </div>

      <div className="mt-8 bg-white border border-ocean-200 rounded-xl p-6 text-sm text-slate-600">
        {role === "OFFICER" && "Use \"Upload Evidence\" to submit a new item to IPFS and register it on-chain."}
        {role === "INVESTIGATOR" && "Open an evidence record to verify its integrity and review its chain of custody."}
        {role === "JUDICIARY" && "Review authorized evidence and its full chain-of-custody timeline."}
        {role === "ADMIN" && "Manage roles under Users, and monitor unauthorized access attempts under Alerts."}
      </div>
    </Layout>
  );
}
