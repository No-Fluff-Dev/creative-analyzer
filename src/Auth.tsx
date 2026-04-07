import { useState } from "react";
import { supabase } from "./supabase";

type AuthMode = "login" | "register" | "forgot";

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async () => {
    setLoading(true);
    reset();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    reset();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) setError(error.message);
    else setSuccess("Check your email to confirm your account, then log in.");
    setLoading(false);
  };

  const handleForgot = async () => {
    setLoading(true);
    reset();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setSuccess("Password reset link sent — check your email.");
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const submit = () => {
    if (mode === "login") handleLogin();
    else if (mode === "register") handleRegister();
    else handleForgot();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#111",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#AAA",
                textTransform: "uppercase",
              }}
            >
              No Fluff
            </span>
          </div>
          <h1
            style={{ fontSize: 24, fontWeight: 600, color: "#111", margin: 0 }}
          >
            Signal
          </h1>
          <p style={{ fontSize: 13, color: "#999", marginTop: 4 }}>
            Pre-flight creative analysis
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #F0F0F0",
            padding: "1.75rem",
            boxShadow: "0 4px 24px rgba(0,0,0,0.05)",
          }}
        >
          {/* Mode tabs */}
          {mode !== "forgot" && (
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "#F5F5F5",
                borderRadius: 8,
                padding: 3,
                marginBottom: "1.25rem",
              }}
            >
              {(["login", "register"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    reset();
                  }}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 6,
                    border: "none",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: mode === m ? "#fff" : "transparent",
                    color: mode === m ? "#111" : "#888",
                    boxShadow:
                      mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {m === "login" ? "Log in" : "Register"}
                </button>
              ))}
            </div>
          )}

          {mode === "forgot" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <button
                onClick={() => {
                  setMode("login");
                  reset();
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 13,
                  color: "#6366F1",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ← Back to log in
              </button>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111",
                  margin: "10px 0 0",
                }}
              >
                Reset your password
              </p>
              <p style={{ fontSize: 12, color: "#999", margin: "4px 0 0" }}>
                We'll send a reset link to your email.
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "register" && (
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  Full name
                </label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jonathan Silva"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#111",
                    outline: "none",
                    boxSizing: "border-box",
                    background: "#FAFAFA",
                  }}
                />
              </div>
            )}
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  display: "block",
                  marginBottom: 5,
                }}
              >
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@company.com"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#111",
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#FAFAFA",
                }}
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#111",
                    outline: "none",
                    boxSizing: "border-box",
                    background: "#FAFAFA",
                  }}
                />
              </div>
            )}
          </div>

          {mode === "login" && (
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button
                onClick={() => {
                  setMode("forgot");
                  reset();
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  color: "#6366F1",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "#FEF2F2",
                borderRadius: 8,
                fontSize: 12,
                color: "#B91C1C",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "#F0FDF4",
                borderRadius: 8,
                fontSize: 12,
                color: "#15803D",
              }}
            >
              {success}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "11px",
              borderRadius: 9,
              border: "none",
              background: loading ? "#F0F0F0" : "#111",
              color: loading ? "#AAA" : "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : mode === "register"
                  ? "Create account"
                  : "Send reset link"}
          </button>

          {mode !== "forgot" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "16px 0",
                }}
              >
                <div style={{ flex: 1, height: 1, background: "#F0F0F0" }} />
                <span style={{ fontSize: 11, color: "#CCC" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "#F0F0F0" }} />
              </div>
              <button
                onClick={handleGoogle}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 9,
                  border: "1px solid #EFEFEF",
                  background: "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#333",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
            </>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#CCC",
            marginTop: 16,
          }}
        >
          Signal by No Fluff · Behavioural creative analysis
        </p>
      </div>
    </div>
  );
}
