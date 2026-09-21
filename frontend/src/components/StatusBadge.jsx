import React from "react";

const STYLES = {
  pending: "bg-status-warn/20 text-status-warn border border-status-warn/40",
  success: "bg-status-ok/20 text-status-ok border border-status-ok/40",
  error: "bg-status-danger/20 text-status-danger border border-status-danger/40",
  neutral: "bg-navy-700 text-slate-300 border border-navy-700"
};

export default function StatusBadge({ tone = "neutral", children }) {
  return <span className={`status-badge ${STYLES[tone]}`}>{children}</span>;
}
