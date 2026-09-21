import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useWeb3 } from "../context/Web3Context.jsx";

const NAV_BY_ROLE = {
  ADMIN: [
    ["/dashboard", "Dashboard"],
    ["/cases", "Cases"],
    ["/evidence", "Evidence"],
    ["/alerts", "Alerts"],
    ["/users", "Users"]
  ],
  OFFICER: [
    ["/dashboard", "Dashboard"],
    ["/cases", "Cases"],
    ["/evidence", "Evidence"],
    ["/evidence/upload", "Upload Evidence"]
  ],
  INVESTIGATOR: [
    ["/dashboard", "Dashboard"],
    ["/evidence", "Evidence"],
    ["/cases", "Cases"]
  ],
  JUDICIARY: [
    ["/dashboard", "Dashboard"],
    ["/evidence", "Evidence"],
    ["/cases", "Cases"]
  ]
};

export default function Layout({ children }) {
  const { role, signOut } = useAuth();
  const { address } = useWeb3();
  const navigate = useNavigate();
  const links = NAV_BY_ROLE[role] || [];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-navy-900 border-r border-navy-700 flex flex-col">
        <div className="px-5 py-5 border-b border-navy-700">
          <div className="text-sm font-semibold tracking-wide text-slate-200">EVIDENCE SYSTEM</div>
          <div className="text-xs text-slate-500 mt-1">Chain-of-Custody Platform</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map(([path, label]) => (
            <Link
              key={path}
              to={path}
              className="block px-3 py-2 rounded text-sm text-slate-300 hover:bg-navy-800 hover:text-white transition"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-navy-700 text-xs">
          <div className="text-slate-500">Signed in as</div>
          <div className="text-slate-300 truncate">{address}</div>
          <div className="mt-1 inline-block px-2 py-0.5 rounded bg-accent-600/20 text-accent-500 text-[10px] font-semibold">
            {role}
          </div>
          <button
            onClick={() => {
              signOut();
              navigate("/login");
            }}
            className="mt-3 w-full text-left text-slate-500 hover:text-status-danger"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-navy-950 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
