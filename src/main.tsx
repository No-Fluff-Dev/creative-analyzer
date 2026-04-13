import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Auth from "./Auth.tsx";
import Admin from "./Admin.tsx";
import { supabase } from "./supabase.ts";
import type { Session } from "@supabase/supabase-js";

function Root() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Detect if we're on the /admin route
  const isAdminRoute =
    window.location.pathname === "/admin" || window.location.hash === "#/admin";

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAFA",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#111",
              margin: "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 13, color: "#AAA" }}>Loading Preflyght…</p>
        </div>
      </div>
    );
  }

  // Admin route — must be logged in
  if (isAdminRoute) {
    if (!session) return <Auth />;
    return <Admin session={session} />;
  }

  // Main app
  return session ? <App session={session} /> : <Auth />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
