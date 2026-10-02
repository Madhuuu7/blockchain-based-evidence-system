import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";

export default function Cases() {
  const { role } = useAuth();
  const [cases, setCases] = useState([]);
  const [form, setForm] = useState({ caseId: "", title: "", description: "" });
  const [error, setError] = useState(null);

  const load = async () => {
    const { data } = await api.get("/cases");
    setCases(data.results);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/cases", form);
      setForm({ caseId: "", title: "", description: "" });
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create case");
    }
  };

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-ocean-900 mb-6">Cases</h1>

      {(role === "OFFICER" || role === "ADMIN" || role === "INVESTIGATOR") && (
        <form onSubmit={handleCreate} className="mb-8 bg-white border border-ocean-200 rounded-xl p-6 grid gap-3 max-w-xl">
          <input placeholder="Case ID" value={form.caseId} onChange={(e) => setForm((f) => ({ ...f, caseId: e.target.value }))} className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm" />
          <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm" />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm" rows={3} />
          <button className="bg-accent-600 hover:bg-accent-700 rounded px-4 py-2 text-sm text-white">Create Case</button>
          {error && <div className="text-sm text-status-danger">{error}</div>}
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {cases.map((c) => (
          <Link key={c._id} to={`/cases/${c.caseId}`} className="bg-white border border-ocean-200 rounded-xl p-5 hover:border-accent-700 transition">
            <div className="text-sm font-medium text-ocean-900">{c.title}</div>
            <div className="text-xs text-slate-500 mt-1">{c.caseId} · {c.status}</div>
            <p className="text-xs text-slate-600 mt-2 line-clamp-2">{c.description}</p>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
