import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import api from "../services/api.js";

const STATUS_TONE = {
  "pending-chain": "pending",
  confirmed: "neutral",
  verified: "success",
  flagged: "error"
};

export default function EvidenceList() {
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ caseId: "", evidenceId: "", fileType: "", status: "", keyword: "" });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== "")
      );
      const { data } = await api.get("/evidence", { params: { ...activeFilters, page, limit: 10 } });
      setResults(data.results);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-ocean-900 mb-6">Evidence</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="flex flex-wrap items-center gap-3 mb-6"
      >
        <input
          placeholder="Case ID"
          value={filters.caseId}
          onChange={(e) => setFilters((f) => ({ ...f, caseId: e.target.value }))}
          className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm w-36"
        />
        <input
          placeholder="Evidence ID"
          type="number"
          value={filters.evidenceId}
          onChange={(e) => setFilters((f) => ({ ...f, evidenceId: e.target.value }))}
          className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm w-32"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="verified">Verified</option>
          <option value="flagged">Flagged</option>
          <option value="pending-chain">Pending Chain</option>
        </select>
        <input
          placeholder="File type"
          value={filters.fileType}
          onChange={(e) => setFilters((f) => ({ ...f, fileType: e.target.value }))}
          className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm w-32"
        />
        <input
          placeholder="Keyword search"
          value={filters.keyword}
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
          className="bg-white border border-ocean-200 rounded px-3 py-2 text-sm flex-1 min-w-[140px]"
        />
        <button type="submit" className="bg-accent-600 hover:bg-accent-700 rounded px-4 py-2 text-sm font-medium text-white">Search</button>
        <button
          type="button"
          onClick={() => {
            setFilters({ caseId: "", evidenceId: "", fileType: "", status: "", keyword: "" });
            setPage(1);
          }}
          className="bg-white hover:bg-ocean-100 text-ocean-700 rounded px-3 py-2 text-sm"
        >
          Reset
        </button>
      </form>

      <div className="bg-white border border-ocean-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Evidence ID</th>
              <th className="px-4 py-3">Case</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r._id} className="border-t border-ocean-200 hover:bg-ocean-50/60">
                <td className="px-4 py-3">
                {r.evidenceId != null ? (
               <Link
                to={`/evidence/${r.evidenceId}`}
                    className="text-accent-700 hover:underline"
                  >
                  {r.evidenceId}
                  </Link>
                  ) : (
                  <span className="text-slate-500">
                  pending
                  </span>
                )}
                </td>
                <td className="px-4 py-3">{r.caseId}</td>
                <td className="px-4 py-3">{r.fileType}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={STATUS_TONE[r.status] || "neutral"}>{r.status}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No evidence found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm text-slate-500">
        <span>{total} total</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 bg-white rounded disabled:opacity-40">
            Prev
          </button>
          <button disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 bg-white rounded disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </Layout>
  );
}
