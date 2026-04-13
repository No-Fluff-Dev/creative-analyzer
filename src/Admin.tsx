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

// ─── PIN GATE ───────────────────────────────────────────────
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
        background: "#0A0A0A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          width: 380,
          background: "#111",
          borderRadius: 20,
          padding: "2.5rem",
          border: "1px solid #1E1E1E",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: `0 8px 20px ${ACCENT}40`,
            }}
          >
            <svg
              width="22"
              height="22"
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
          <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
            No Fluff · Preflyght
          </p>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#555",
              display: "block",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
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
              border: "1px solid #2A2A2A",
              background: "#1A1A1A",
              color: "#fff",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        {error && (
          <p
            style={{
              fontSize: 12,
              color: "#F87171",
              marginBottom: 12,
              padding: "8px 12px",
              background: "#2A1010",
              borderRadius: 8,
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
            background: pin && !loading ? ACCENT : "#1E1E1E",
            color: pin && !loading ? "#fff" : "#444",
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #F0F0F0",
        borderRadius: 14,
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
            borderRadius: "14px 14px 0 0",
          }}
        />
      )}
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#AAA",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 8px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 32,
          fontWeight: 700,
          color,
          margin: 0,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 12, color: "#BBB", margin: "6px 0 0" }}>{sub}</p>
      )}
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
      credits_used: allAnalyses.reduce(
        (sum, a) => sum + (a.credits_used || 0),
        0,
      ),
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
    const { error } = await supabase.from("organisations").insert({
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

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #E5E5E5",
    borderRadius: 8,
    fontSize: 13,
    color: "#111",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const thStyle = {
    padding: "11px 16px",
    fontSize: 10,
    fontWeight: 700,
    color: "#AAA",
    textTransform: "uppercase" as const,
    textAlign: "left" as const,
    whiteSpace: "nowrap" as const,
    letterSpacing: "0.06em",
  };

  if (checking)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FAFAFA",
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
          background: "#0A0A0A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🚫</p>
          <p
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              margin: "0 0 6px",
            }}
          >
            Access Denied
          </p>
          <p style={{ fontSize: 13, color: "#555" }}>
            You don't have superadmin privileges.
          </p>
        </div>
      </div>
    );

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "orgs", label: `Organisations (${stats.orgs})` },
    { id: "users", label: `Users (${stats.users})` },
    { id: "analyses", label: `Analyses (${stats.analyses})` },
  ] as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F8F8",
        fontFamily: "system-ui",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#111",
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 58,
          borderBottom: "1px solid #1A1A1A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>
              NF
            </span>
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "0.02em",
            }}
          >
            Preflyght Admin
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: 20,
              background: `${ACCENT}25`,
              color: ACCENT,
              border: `1px solid ${ACCENT}40`,
              letterSpacing: "0.08em",
            }}
          >
            SUPERADMIN
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#555" }}>
            {session.user.email}
          </span>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid #2A2A2A",
              background: "transparent",
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← Back to app
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "2rem" }}>
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#EBEBEB",
            borderRadius: 10,
            padding: 4,
            marginBottom: "2rem",
            width: "fit-content",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
                background: activeTab === t.id ? "#fff" : "transparent",
                color: activeTab === t.id ? "#111" : "#888",
                boxShadow:
                  activeTab === t.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 14,
              }}
            >
              <StatCard
                label="Total Users"
                value={stats.users}
                sub="Registered accounts"
                accent="#111"
              />
              <StatCard
                label="Organisations"
                value={stats.orgs}
                sub="Active orgs"
                color={ACCENT}
                accent={ACCENT}
              />
              <StatCard
                label="Total Analyses"
                value={stats.analyses}
                sub="All time"
                color="#111"
                accent="#111"
              />
              <StatCard
                label="Credits Used"
                value={stats.credits_used}
                sub="All time total"
                color={AMBER}
                accent={AMBER}
              />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#111",
                  margin: "0 0 1rem",
                }}
              >
                Recent Activity
              </h2>
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #EFEFEF",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        background: "#FAFAFA",
                        borderBottom: "1px solid #F0F0F0",
                      }}
                    >
                      {[
                        "Date",
                        "Client",
                        "Platform",
                        "Industry",
                        "Model",
                        "Score",
                        "Credits",
                      ].map((h) => (
                        <th key={h} style={thStyle}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.slice(0, 10).map((a) => (
                      <tr
                        key={a.id}
                        style={{ borderBottom: "1px solid #F8F8F8" }}
                      >
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 12,
                            color: "#999",
                            textAlign: "center",
                          }}
                        >
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#111",
                            textAlign: "center",
                          }}
                        >
                          {a.client || "—"}
                        </td>
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 12,
                            color: "#666",
                            textAlign: "center",
                          }}
                        >
                          {a.platform || "—"}
                        </td>
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 12,
                            color: "#666",
                            textAlign: "center",
                          }}
                        >
                          {a.industry || "—"}
                        </td>
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 12,
                            color: "#666",
                            textAlign: "center",
                          }}
                        >
                          {modelName(a.model)}
                        </td>
                        <td style={{ padding: "13px 16px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                textAlign: "center",
                                color: scoreColor(a.overall_score),
                              }}
                            >
                              {a.overall_score}
                            </span>
                            <Badge pass={a.pass} />
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "13px 16px",
                            fontSize: 12,
                            textAlign: "center",
                            color: "#666",
                          }}
                        >
                          {a.credits_used ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {analyses.length === 0 && (
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
                    )}
                  </tbody>
                </table>
              </div>
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
                border: "1px solid #EFEFEF",
                borderRadius: 14,
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
                Create Organisation
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
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
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
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
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
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
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
                    style={{ ...inputStyle, width: 100 }}
                  />
                </div>
                <button
                  onClick={createOrg}
                  disabled={!newOrgName.trim() || creatingOrg}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 8,
                    border: "none",
                    background: newOrgName.trim() ? "#111" : "#F0F0F0",
                    color: newOrgName.trim() ? "#fff" : "#AAA",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: newOrgName.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                    height: 42,
                  }}
                >
                  {creatingOrg ? "Creating…" : "+ Create"}
                </button>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      background: "#FAFAFA",
                      borderBottom: "1px solid #F0F0F0",
                    }}
                  >
                    {[
                      "Organisation",
                      "Slug",
                      "Credits Pool",
                      "Members",
                      "Created",
                      "Actions",
                    ].map((h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
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
                      <tr
                        key={o.id}
                        style={{ borderBottom: "1px solid #F8F8F8" }}
                      >
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#111",
                          }}
                        >
                          {o.name}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: "#999",
                            fontFamily: "monospace",
                          }}
                        >
                          {o.slug}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: ACCENT,
                            }}
                          >
                            {o.credits_pool}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 13,
                            color: "#666",
                          }}
                        >
                          {o.member_count || 0}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: "#999",
                          }}
                        >
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
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
                        </td>
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
              border: "1px solid #EFEFEF",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#FAFAFA",
                    borderBottom: "1px solid #F0F0F0",
                  }}
                >
                  {[
                    "User",
                    "Email",
                    "Company",
                    "Role",
                    "Credits",
                    "Joined",
                    "Actions",
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
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
                    <tr
                      key={u.id}
                      style={{ borderBottom: "1px solid #F8F8F8" }}
                    >
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {u.full_name || "—"}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {u.email}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {u.company || "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <select
                          value={u.system_role || "user"}
                          onChange={(e) => updateRole(u.id, e.target.value)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #E5E5E5",
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              u.system_role === "superadmin"
                                ? "#F5F3FF"
                                : "#F8F8F8",
                            color:
                              u.system_role === "superadmin" ? ACCENT : "#555",
                            outline: "none",
                            cursor: "pointer",
                          }}
                        >
                          <option value="user">User</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {editingUser === u.id ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
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
                                border: "1px solid #E5E5E5",
                                fontSize: 12,
                                color: "#111",
                                background: "#fff",
                                outline: "none",
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
                                border: "1px solid #E5E5E5",
                                background: "#fff",
                                cursor: "pointer",
                                color: "#888",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: ACCENT,
                            }}
                          >
                            {u.credits_remaining ?? 0}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 12,
                          color: "#999",
                        }}
                      >
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <button
                          onClick={() => {
                            setEditingUser(u.id);
                            setEditCredits(u.credits_remaining ?? 0);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            borderRadius: 6,
                            border: "1px solid #E5E5E5",
                            background: "#fff",
                            cursor: "pointer",
                            color: "#444",
                            fontWeight: 600,
                          }}
                        >
                          Edit Credits
                        </button>
                      </td>
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
              border: "1px solid #EFEFEF",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#FAFAFA",
                    borderBottom: "1px solid #F0F0F0",
                  }}
                >
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
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
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
                    <tr
                      key={a.id}
                      style={{ borderBottom: "1px solid #F8F8F8" }}
                    >
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#999",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {a.client || "—"}
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {a.platform || "—"}
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {a.industry || "—"}
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {a.type || "Single"}
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {modelName(a.model)}
                      </td>
                      <td style={{ padding: "13px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: scoreColor(a.overall_score),
                            }}
                          >
                            {a.overall_score}
                          </span>
                          <Badge pass={a.pass} />
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "13px 16px",
                          fontSize: 12,
                          color: "#666",
                        }}
                      >
                        {a.credits_used ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
