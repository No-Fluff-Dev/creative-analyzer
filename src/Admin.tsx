import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

const ACCENT = "#6366F1";
const GREEN = "#15803D";
const GREEN_BG = "#F0FDF4";
const RED = "#B91C1C";
const RED_BG = "#FEF2F2";
const AMBER = "#B45309";
const AMBER_BG = "#FFFBEB";

function scoreColor(s: number) {
  return s >= 75 ? GREEN : s >= 50 ? AMBER : RED;
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
    if (data.ok) {
      onUnlock();
    } else {
      setError("Incorrect PIN. Access denied.");
    }
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
          width: 360,
          background: "#111",
          borderRadius: 16,
          padding: "2rem",
          border: "1px solid #222",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
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
            style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}
          >
            Admin Access
          </h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            No Fluff · Preflyght
          </p>
        </div>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verify()}
          placeholder="Enter admin PIN"
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#1A1A1A",
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 10,
          }}
        />
        {error && (
          <p style={{ fontSize: 12, color: RED, marginBottom: 10 }}>{error}</p>
        )}
        <button
          onClick={verify}
          disabled={loading || !pin}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            border: "none",
            background: pin && !loading ? ACCENT : "#333",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: pin && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Verifying…" : "Unlock"}
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
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #F0F0F0",
        borderRadius: 12,
        padding: "1.25rem",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#AAA",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: "0 0 6px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0 }}>{value}</p>
      {sub && (
        <p style={{ fontSize: 11, color: "#AAA", margin: "4px 0 0" }}>{sub}</p>
      )}
    </div>
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

  // Data
  const [stats, setStats] = useState({
    users: 0,
    orgs: 0,
    analyses: 0,
    credits_used: 0,
  });
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);

  // Org create
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgCredits, setNewOrgCredits] = useState(100);
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Credit edit
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editCredits, setEditCredits] = useState(0);

  // Check superadmin
  useEffect(() => {
    supabase
      .from("profiles")
      .select("system_role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setIsSuperadmin(data?.system_role === "superadmin");
        setChecking(false);
      });
  }, [session]);

  // Load data once unlocked
  useEffect(() => {
    if (!unlocked || !isSuperadmin) return;
    loadAll();
  }, [unlocked, isSuperadmin]);

  const loadAll = async () => {
    const [profilesRes, orgsRes, analysesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("organisations")
        .select("*, organisation_members(count)")
        .order("created_at", { ascending: false }),
      supabase
        .from("analyses")
        .select(
          "id, user_id, client, platform, industry, model, credits_used, overall_score, pass, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
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
          background: "#FAFAFA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>🚫</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
            Access Denied
          </p>
          <p style={{ fontSize: 13, color: "#888" }}>
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
        background: "#FAFAFA",
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
          height: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
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
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Preflyght Admin
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 20,
              background: ACCENT,
              color: "#fff",
            }}
          >
            SUPERADMIN
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#666" }}>
            {session.user.email}
          </span>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "transparent",
              color: "#888",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← Back to app
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem" }}>
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#EFEFEF",
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
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
                background: activeTab === t.id ? "#fff" : "transparent",
                color: activeTab === t.id ? "#111" : "#888",
                boxShadow:
                  activeTab === t.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <StatCard
                label="Total Users"
                value={stats.users}
                sub="Registered accounts"
              />
              <StatCard
                label="Organisations"
                value={stats.orgs}
                sub="Active orgs"
                color={ACCENT}
              />
              <StatCard
                label="Total Analyses"
                value={stats.analyses}
                sub="All time"
                color="#111"
              />
              <StatCard
                label="Credits Used"
                value={stats.credits_used}
                sub="All time total"
                color={AMBER}
              />
            </div>

            {/* Recent analyses */}
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
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        background: "#FAFAFA",
                        borderBottom: "1px solid #EFEFEF",
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
                        <th
                          key={h}
                          style={{
                            padding: "10px 14px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.slice(0, 10).map((a) => (
                      <tr
                        key={a.id}
                        style={{ borderBottom: "1px solid #F5F5F5" }}
                      >
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          {new Date(a.created_at).toLocaleDateString()}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#111",
                          }}
                        >
                          {a.client || "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#555",
                          }}
                        >
                          {a.platform || "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#555",
                          }}
                        >
                          {a.industry || "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#555",
                          }}
                        >
                          {a.model?.split("-").slice(-2).join(" ") || "—"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: scoreColor(a.overall_score),
                            }}
                          >
                            {a.overall_score}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 20,
                              background: a.pass ? GREEN_BG : RED_BG,
                              color: a.pass ? GREEN : RED,
                              marginLeft: 6,
                            }}
                          >
                            {a.pass ? "PASS" : "FAIL"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "#555",
                          }}
                        >
                          {a.credits_used || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ORGANISATIONS */}
        {activeTab === "orgs" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {/* Create org */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #F0F0F0",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111",
                  margin: "0 0 1rem",
                }}
              >
                Create Organisation
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto auto",
                  gap: 10,
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
                      marginBottom: 5,
                      textTransform: "uppercase",
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
                    placeholder="No Fluff Agency"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#111",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
                      textTransform: "uppercase",
                    }}
                  >
                    Slug
                  </label>
                  <input
                    value={newOrgSlug}
                    onChange={(e) => setNewOrgSlug(e.target.value)}
                    placeholder="no-fluff-agency"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#111",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
                      textTransform: "uppercase",
                    }}
                  >
                    Credits
                  </label>
                  <input
                    type="number"
                    value={newOrgCredits}
                    onChange={(e) => setNewOrgCredits(Number(e.target.value))}
                    style={{
                      width: 90,
                      padding: "9px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#111",
                      outline: "none",
                    }}
                  />
                </div>
                <button
                  onClick={createOrg}
                  disabled={!newOrgName.trim() || creatingOrg}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: newOrgName.trim() ? "#111" : "#F0F0F0",
                    color: newOrgName.trim() ? "#fff" : "#AAA",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: newOrgName.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}
                >
                  {creatingOrg ? "Creating…" : "+ Create"}
                </button>
              </div>
            </div>

            {/* Orgs list */}
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
                      borderBottom: "1px solid #EFEFEF",
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
                      <th
                        key={h}
                        style={{
                          padding: "12px 16px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#AAA",
                          textTransform: "uppercase",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                        }}
                      >
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
                          color: "#888",
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
                        style={{ borderBottom: "1px solid #F5F5F5" }}
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
                            color: "#888",
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
                            color: "#555",
                          }}
                        >
                          {o.organisation_members?.[0]?.count || 0}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: "#888",
                          }}
                        >
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <button
                            onClick={() => deleteOrg(o.id)}
                            style={{
                              fontSize: 11,
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid #FECACA",
                              background: RED_BG,
                              cursor: "pointer",
                              color: RED,
                              fontWeight: 500,
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

        {/* USERS */}
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
                    borderBottom: "1px solid #EFEFEF",
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
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#AAA",
                        textTransform: "uppercase",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                        color: "#888",
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
                      style={{ borderBottom: "1px solid #F5F5F5" }}
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
                          color: "#555",
                        }}
                      >
                        {u.email}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {u.company || "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <select
                          value={u.system_role || "user"}
                          onChange={(e) => updateRole(u.id, e.target.value)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: "1px solid #EFEFEF",
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              u.system_role === "superadmin"
                                ? "#F5F3FF"
                                : "#FAFAFA",
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
                                width: 70,
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid #EFEFEF",
                                fontSize: 12,
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => updateCredits(u.id, editCredits)}
                              style={{
                                fontSize: 11,
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "none",
                                background: "#111",
                                color: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              style={{
                                fontSize: 11,
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid #EFEFEF",
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
                          color: "#888",
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
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid #EFEFEF",
                            background: "#fff",
                            cursor: "pointer",
                            color: "#444",
                            fontWeight: 500,
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

        {/* ANALYSES */}
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
                    borderBottom: "1px solid #EFEFEF",
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
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#AAA",
                        textTransform: "uppercase",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                        color: "#888",
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
                      style={{ borderBottom: "1px solid #F5F5F5" }}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#888",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {a.client || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {a.platform || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {a.industry || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {a.type || "Single"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {a.model?.split("-").slice(-2).join(" ") || "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: scoreColor(a.overall_score),
                          }}
                        >
                          {a.overall_score}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 20,
                            background: a.pass ? GREEN_BG : RED_BG,
                            color: a.pass ? GREEN : RED,
                            marginLeft: 6,
                          }}
                        >
                          {a.pass ? "PASS" : "FAIL"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          color: "#555",
                        }}
                      >
                        {a.credits_used || "—"}
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
