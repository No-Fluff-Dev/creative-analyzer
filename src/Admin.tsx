import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

const ACCENT = "#6366F1";
const GREEN = "#15803D";
const GREEN_BG = "#F0FDF4";
const RED = "#B91C1C";
const RED_BG = "#FEF2F2";
const AMBER = "#B45309";

function scoreColor(s: number) {
  return s >= 75 ? GREEN : s >= 50 ? AMBER : RED;
}

function modelName(id: string) {
  if (!id) return "—";
  return id
    .replace(/^claude-/, "Claude ")
    .replace(/-(\d{8})$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── PIN GATE ────────────────────────────────────────────────
function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    setLoading(true);
    setError("");
    const resp = await fetch("/api/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await resp.json();
    if (data.ok) onUnlock();
    else setError("Incorrect PIN. Access denied.");
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          width: 400,
          background: "#111113",
          borderRadius: 20,
          padding: "2.5rem",
          border: "1px solid #1F1F23",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${ACCENT}, #818CF8)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
              boxShadow: `0 12px 28px ${ACCENT}50`,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: "0 0 6px",
            }}
          >
            Admin Access
          </h1>
          <p style={{ fontSize: 13, color: "#52525B", margin: 0 }}>
            No Fluff · Preflyght
          </p>
        </div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#52525B",
            display: "block",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Admin PIN
        </label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verify()}
          placeholder="••••••••"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #27272A",
            background: "#18181B",
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 10,
          }}
        />
        {error && (
          <p
            style={{
              fontSize: 12,
              color: "#F87171",
              marginBottom: 12,
              padding: "10px 14px",
              background: "#1C0A0A",
              borderRadius: 8,
              border: "1px solid #3F1515",
            }}
          >
            {error}
          </p>
        )}
        <button
          onClick={verify}
          disabled={loading || !pin}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: 10,
            border: "none",
            background:
              pin && !loading
                ? `linear-gradient(135deg, ${ACCENT}, #818CF8)`
                : "#18181B",
            color: pin && !loading ? "#fff" : "#3F3F46",
            fontSize: 14,
            fontWeight: 600,
            cursor: pin && !loading ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          {loading ? "Verifying…" : "Unlock Dashboard"}
        </button>
      </div>
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color = "#111",
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  accent?: string;
  icon?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #F0F0F0",
        borderRadius: 16,
        padding: "1.5rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: accent,
            borderRadius: "16px 16px 0 0",
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#AAA",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 10px",
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 34,
              fontWeight: 800,
              color,
              margin: 0,
              lineHeight: 1,
            }}
          >
            {value}
          </p>
          {sub && (
            <p style={{ fontSize: 12, color: "#BBB", margin: "8px 0 0" }}>
              {sub}
            </p>
          )}
        </div>
        {icon && <span style={{ fontSize: 28, opacity: 0.15 }}>{icon}</span>}
      </div>
    </div>
  );
}

// ─── BADGE ───────────────────────────────────────────────────
function Badge({ pass }: { pass: boolean }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 20,
        background: pass ? GREEN_BG : RED_BG,
        color: pass ? GREEN : RED,
      }}
    >
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

// ─── TABLE HELPERS ───────────────────────────────────────────
const TH = ({ children }: { children: string }) => (
  <th
    style={{
      padding: "12px 16px",
      fontSize: 10,
      fontWeight: 700,
      color: "#AAA",
      textTransform: "uppercase",
      textAlign: "center",
      whiteSpace: "nowrap",
      letterSpacing: "0.07em",
      background: "#FAFAFA",
      borderBottom: "1px solid #F0F0F0",
    }}
  >
    {children}
  </th>
);
const TD = ({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <td
    style={{
      padding: "13px 16px",
      fontSize: 13,
      color: "#555",
      textAlign: "center",
      borderBottom: "1px solid #F8F8F8",
      verticalAlign: "middle",
      ...style,
    }}
  >
    {children}
  </td>
);

// ─── SIDEBAR NAV ITEM ────────────────────────────────────────
function NavItem({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 10,
        border: "none",
        background: active ? `${ACCENT}15` : "transparent",
        color: active ? ACCENT : "#71717A",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 12,
            background: active ? ACCENT : "#F4F4F5",
            color: active ? "#fff" : "#888",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── MAIN ADMIN ──────────────────────────────────────────────
export default function Admin({ session }: { session: Session }) {
  const [unlocked, setUnlocked] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "orgs" | "users" | "analyses"
  >("overview");

  const [stats, setStats] = useState({
    users: 0,
    orgs: 0,
    analyses: 0,
    credits_used: 0,
  });
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgCredits, setNewOrgCredits] = useState(100);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editCredits, setEditCredits] = useState(0);

  useEffect(() => {
    supabase.rpc("get_my_system_role").then(({ data, error }) => {
      if (error || !data) {
        supabase
          .from("profiles")
          .select("system_role")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            setIsSuperadmin(profile?.system_role === "superadmin");
            setChecking(false);
          });
      } else {
        setIsSuperadmin(data === "superadmin");
        setChecking(false);
      }
    });
  }, [session]);

  useEffect(() => {
    if (!unlocked || !isSuperadmin) return;
    loadAll();
  }, [unlocked, isSuperadmin]);

  const loadAll = async () => {
    const [profilesRes, orgsRes, analysesRes] = await Promise.all([
      supabase.rpc("admin_get_all_profiles"),
      supabase.rpc("admin_get_all_orgs"),
      supabase.rpc("admin_get_all_analyses"),
    ]);
    const allUsers = profilesRes.data || [];
    const allOrgs = orgsRes.data || [];
    const allAnalyses = analysesRes.data || [];
    setUsers(allUsers);
    setOrgs(allOrgs);
    setAnalyses(allAnalyses);
    setStats({
      users: allUsers.length,
      orgs: allOrgs.length,
      analyses: allAnalyses.length,
      credits_used: allAnalyses.reduce((s, a) => s + (a.credits_used || 0), 0),
    });
  };

  const updateCredits = async (userId: string, credits: number) => {
    await supabase
      .from("profiles")
      .update({ credits_remaining: credits })
      .eq("id", userId);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, credits_remaining: credits } : u,
      ),
    );
    setEditingUser(null);
  };

  const updateRole = async (userId: string, role: string) => {
    await supabase
      .from("profiles")
      .update({ system_role: role })
      .eq("id", userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, system_role: role } : u)),
    );
  };

  const createOrg = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) return;
    setCreatingOrg(true);
    const { error } = await supabase
      .from("organisations")
      .insert({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim().toLowerCase().replace(/\s+/g, "-"),
        credits_pool: newOrgCredits,
        created_by: session.user.id,
      });
    if (!error) {
      setNewOrgName("");
      setNewOrgSlug("");
      setNewOrgCredits(100);
      loadAll();
    }
    setCreatingOrg(false);
  };

  const deleteOrg = async (id: string) => {
    if (!confirm("Delete this organisation? This cannot be undone.")) return;
    await supabase.from("organisations").delete().eq("id", id);
    setOrgs((prev) => prev.filter((o) => o.id !== id));
    setStats((s) => ({ ...s, orgs: s.orgs - 1 }));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    color: "#111",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
  };

  if (checking)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#F8F8F8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "#888", fontSize: 13 }}>Checking access…</p>
      </div>
    );

  if (!isSuperadmin)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#09090B",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 40, marginBottom: 16 }}>🚫</p>
          <p
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#fff",
              margin: "0 0 8px",
            }}
          >
            Access Denied
          </p>
          <p style={{ fontSize: 13, color: "#52525B" }}>
            You don't have superadmin privileges.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              marginTop: 24,
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #27272A",
              background: "transparent",
              color: "#71717A",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← Back to app
          </button>
        </div>
      </div>
    );

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  const navItems = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: "orgs",
      label: "Organisations",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 21h18M9 8h1m4 0h1M9 12h1m4 0h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        </svg>
      ),
      count: stats.orgs,
    },
    {
      id: "users",
      label: "Users",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      count: stats.users,
    },
    {
      id: "analyses",
      label: "Analyses",
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      count: stats.analyses,
    },
  ] as const;

  const pageTitle: Record<string, string> = {
    overview: "Overview",
    orgs: "Organisations",
    users: "Users",
    analyses: "Analyses",
  };
  const pageDesc: Record<string, string> = {
    overview: "Platform-wide stats and recent activity",
    orgs: "Create and manage organisations",
    users: "Manage users, roles and credits",
    analyses: "View all analyses across the platform",
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F4F4F5",
        fontFamily: "system-ui",
      }}
    >
      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: 240,
          background: "#fff",
          borderRight: "1px solid #F0F0F0",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 50,
        }}
      >
        {/* Logo */}
        <div
          style={{ padding: "1.25rem 1rem", borderBottom: "1px solid #F4F4F5" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${ACCENT}, #818CF8)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                NF
              </span>
            </div>
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#111",
                  margin: 0,
                }}
              >
                Preflyght
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: "#AAA",
                  margin: 0,
                  letterSpacing: "0.05em",
                }}
              >
                ADMIN PANEL
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            padding: "1rem 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#D4D4D8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              padding: "0 8px",
              marginBottom: 8,
            }}
          >
            Navigation
          </p>
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={activeTab === item.id}
              count={"count" in item ? item.count : undefined}
              onClick={() => setActiveTab(item.id)}
            />
          ))}
        </nav>

        {/* User footer */}
        <div
          style={{
            padding: "1rem",
            borderTop: "1px solid #F4F4F5",
            background: "#FAFAFA",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: `${ACCENT}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>
                {session.user.email?.[0].toUpperCase()}
              </span>
            </div>
            <div style={{ overflow: "hidden" }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#111",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {session.user.email}
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: ACCENT,
                  margin: 0,
                  fontWeight: 700,
                }}
              >
                Superadmin
              </p>
            </div>
          </div>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
              background: "#fff",
              color: "#71717A",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Back to app
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main
        style={{
          marginLeft: 240,
          flex: 1,
          padding: "2rem",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#111",
              margin: "0 0 4px",
            }}
          >
            {pageTitle[activeTab]}
          </h1>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
            {pageDesc[activeTab]}
          </p>
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}
            >
              <StatCard
                label="Total Users"
                value={stats.users}
                sub="Registered accounts"
                accent="#111"
                icon="👥"
              />
              <StatCard
                label="Organisations"
                value={stats.orgs}
                sub="Active orgs"
                color={ACCENT}
                accent={ACCENT}
                icon="🏢"
              />
              <StatCard
                label="Total Analyses"
                value={stats.analyses}
                sub="All time"
                color="#111"
                accent="#111"
                icon="📊"
              />
              <StatCard
                label="Credits Used"
                value={stats.credits_used}
                sub="All time total"
                color={AMBER}
                accent={AMBER}
                icon="⚡"
              />
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #F0F0F0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "1.25rem 1.5rem",
                  borderBottom: "1px solid #F4F4F5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                  }}
                >
                  Recent Activity
                </h2>
                <span style={{ fontSize: 12, color: "#AAA" }}>
                  Last 10 analyses
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Client",
                      "Platform",
                      "Industry",
                      "Model",
                      "Score",
                      "Credits",
                    ].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analyses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: "3rem",
                          textAlign: "center",
                          color: "#AAA",
                          fontSize: 13,
                        }}
                      >
                        No analyses yet.
                      </td>
                    </tr>
                  ) : (
                    analyses.slice(0, 10).map((a) => (
                      <tr key={a.id}>
                        <TD>{new Date(a.created_at).toLocaleDateString()}</TD>
                        <TD style={{ fontWeight: 600, color: "#111" }}>
                          {a.client || "—"}
                        </TD>
                        <TD>{a.platform || "—"}</TD>
                        <TD>{a.industry || "—"}</TD>
                        <TD>{modelName(a.model)}</TD>
                        <TD>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                color: scoreColor(a.overall_score),
                              }}
                            >
                              {a.overall_score}
                            </span>
                            <Badge pass={a.pass} />
                          </div>
                        </TD>
                        <TD>{a.credits_used ?? "—"}</TD>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ORGANISATIONS ── */}
        {activeTab === "orgs" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #F0F0F0",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111",
                  margin: "0 0 1.25rem",
                }}
              >
                Create New Organisation
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto auto",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#888",
                      display: "block",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Name
                  </label>
                  <input
                    value={newOrgName}
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      setNewOrgSlug(
                        e.target.value.toLowerCase().replace(/\s+/g, "-"),
                      );
                    }}
                    placeholder="e.g. No Fluff Agency"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#888",
                      display: "block",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Slug
                  </label>
                  <input
                    value={newOrgSlug}
                    onChange={(e) => setNewOrgSlug(e.target.value)}
                    placeholder="no-fluff-agency"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#888",
                      display: "block",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Credits
                  </label>
                  <input
                    type="number"
                    value={newOrgCredits}
                    onChange={(e) => setNewOrgCredits(Number(e.target.value))}
                    style={{ ...inputStyle, width: 110 }}
                  />
                </div>
                <button
                  onClick={createOrg}
                  disabled={!newOrgName.trim() || creatingOrg}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: newOrgName.trim() ? ACCENT : "#E5E7EB",
                    color: newOrgName.trim() ? "#fff" : "#AAA",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: newOrgName.trim() ? "pointer" : "not-allowed",
                    height: 42,
                    whiteSpace: "nowrap",
                  }}
                >
                  {creatingOrg ? "Creating…" : "+ Create"}
                </button>
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #F0F0F0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "1.25rem 1.5rem",
                  borderBottom: "1px solid #F4F4F5",
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                  }}
                >
                  All Organisations
                </h2>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "Organisation",
                      "Slug",
                      "Credits Pool",
                      "Members",
                      "Created",
                      "Actions",
                    ].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orgs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "3rem",
                          textAlign: "center",
                          color: "#AAA",
                          fontSize: 13,
                        }}
                      >
                        No organisations yet.
                      </td>
                    </tr>
                  ) : (
                    orgs.map((o) => (
                      <tr key={o.id}>
                        <TD style={{ fontWeight: 600, color: "#111" }}>
                          {o.name}
                        </TD>
                        <TD
                          style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          {o.slug}
                        </TD>
                        <TD style={{ fontWeight: 700, color: ACCENT }}>
                          {o.credits_pool}
                        </TD>
                        <TD>{o.member_count || 0}</TD>
                        <TD>{new Date(o.created_at).toLocaleDateString()}</TD>
                        <TD>
                          <button
                            onClick={() => deleteOrg(o.id)}
                            style={{
                              fontSize: 11,
                              padding: "5px 12px",
                              borderRadius: 6,
                              border: "1px solid #FECACA",
                              background: RED_BG,
                              cursor: "pointer",
                              color: RED,
                              fontWeight: 600,
                            }}
                          >
                            Delete
                          </button>
                        </TD>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {activeTab === "users" && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #F0F0F0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid #F4F4F5",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111",
                  margin: 0,
                }}
              >
                All Users
              </h2>
              <span style={{ fontSize: 12, color: "#AAA" }}>
                {stats.users} registered
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "User",
                    "Email",
                    "Company",
                    "Role",
                    "Credits",
                    "Joined",
                    "Actions",
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "3rem",
                        textAlign: "center",
                        color: "#AAA",
                        fontSize: 13,
                      }}
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <TD style={{ fontWeight: 600, color: "#111" }}>
                        {u.full_name || "—"}
                      </TD>
                      <TD style={{ fontSize: 12 }}>{u.email}</TD>
                      <TD style={{ fontSize: 12 }}>{u.company || "—"}</TD>
                      <TD>
                        <select
                          value={u.system_role || "user"}
                          onChange={(e) => updateRole(u.id, e.target.value)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #E5E7EB",
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              u.system_role === "superadmin"
                                ? "#EEF2FF"
                                : "#F9FAFB",
                            color:
                              u.system_role === "superadmin" ? ACCENT : "#555",
                            outline: "none",
                            cursor: "pointer",
                          }}
                        >
                          <option value="user">User</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </TD>
                      <TD>
                        {editingUser === u.id ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                            }}
                          >
                            <input
                              type="number"
                              value={editCredits}
                              onChange={(e) =>
                                setEditCredits(Number(e.target.value))
                              }
                              style={{
                                width: 75,
                                padding: "5px 8px",
                                borderRadius: 6,
                                border: "1px solid #E5E7EB",
                                fontSize: 12,
                                color: "#111",
                                background: "#fff",
                                outline: "none",
                                textAlign: "center",
                              }}
                            />
                            <button
                              onClick={() => updateCredits(u.id, editCredits)}
                              style={{
                                fontSize: 11,
                                padding: "5px 10px",
                                borderRadius: 6,
                                border: "none",
                                background: "#111",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              style={{
                                fontSize: 11,
                                padding: "5px 8px",
                                borderRadius: 6,
                                border: "1px solid #E5E7EB",
                                background: "#fff",
                                cursor: "pointer",
                                color: "#888",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 700, color: ACCENT }}>
                            {u.credits_remaining ?? 0}
                          </span>
                        )}
                      </TD>
                      <TD style={{ fontSize: 12 }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </TD>
                      <TD>
                        <button
                          onClick={() => {
                            setEditingUser(u.id);
                            setEditCredits(u.credits_remaining ?? 0);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid #E5E7EB",
                            background: "#fff",
                            cursor: "pointer",
                            color: "#444",
                            fontWeight: 600,
                          }}
                        >
                          Edit Credits
                        </button>
                      </TD>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── ANALYSES ── */}
        {activeTab === "analyses" && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #F0F0F0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid #F4F4F5",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111",
                  margin: 0,
                }}
              >
                All Analyses
              </h2>
              <span style={{ fontSize: 12, color: "#AAA" }}>
                Last 200 records
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Client",
                    "Platform",
                    "Industry",
                    "Type",
                    "Model",
                    "Score",
                    "Credits",
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analyses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "3rem",
                        textAlign: "center",
                        color: "#AAA",
                        fontSize: 13,
                      }}
                    >
                      No analyses yet.
                    </td>
                  </tr>
                ) : (
                  analyses.map((a) => (
                    <tr key={a.id}>
                      <TD style={{ fontSize: 12 }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </TD>
                      <TD style={{ fontWeight: 600, color: "#111" }}>
                        {a.client || "—"}
                      </TD>
                      <TD style={{ fontSize: 12 }}>{a.platform || "—"}</TD>
                      <TD style={{ fontSize: 12 }}>{a.industry || "—"}</TD>
                      <TD style={{ fontSize: 12 }}>{a.type || "Single"}</TD>
                      <TD style={{ fontSize: 12 }}>{modelName(a.model)}</TD>
                      <TD>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color: scoreColor(a.overall_score),
                            }}
                          >
                            {a.overall_score}
                          </span>
                          <Badge pass={a.pass} />
                        </div>
                      </TD>
                      <TD>{a.credits_used ?? "—"}</TD>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
