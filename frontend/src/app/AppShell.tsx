"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import AIChatWidget from "./AIChatWidget";
import {
  clearStoredSession,
  getStoredSession,
  type StoredSession,
} from "./auth-storage";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

const navItems = [
  { href: "/map", label: "Map" },
  { href: "/data", label: "Data" },
  { href: "/alarms", label: "Log / Alarms" },
];

export default function AppShell({
  title,
  description,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const storedSession = getStoredSession();

    if (!storedSession) {
      router.replace("/login");
      setIsCheckingSession(false);
      return;
    }

    setSession(storedSession);
    setIsCheckingSession(false);
  }, [router]);

  const activeItemLabel = useMemo(() => {
    if (pathname === "/chart") {
      return "Chart";
    }

    return navItems.find((item) => item.href === pathname)?.label ?? "Workspace";
  }, [pathname]);

  function handleLogout() {
    clearStoredSession();
    setSession(null);
    router.replace("/login");
  }

  if (isCheckingSession || !session) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "24rem",
            backgroundColor: "#111c30",
            border: "1px solid #24324a",
            borderRadius: "1rem",
            padding: "1.5rem",
            color: "#cbd5e1",
            textAlign: "center",
          }}
        >
          Opening workspace...
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "78rem",
          margin: "0 auto",
          display: "grid",
          gap: "1.5rem",
        }}
      >
        <header
          style={{
            display: "grid",
            gap: "1rem",
            backgroundColor: "#111c30",
            border: "1px solid #24324a",
            borderRadius: "1rem",
            padding: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: "#38bdf8",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                }}
              >
                zetaced.systea.cloud
              </p>
              <h1
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "1.6rem",
                }}
              >
                {title}
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              <SessionPill label="Client" value={session.clientName} />
              <SessionPill label="User" value={session.username} />
              <SessionPill label="Level" value={String(session.userLevel)} />
              <button
                onClick={handleLogout}
                style={{
                  border: "1px solid #334155",
                  backgroundColor: "#0b1220",
                  color: "#f8fafc",
                  borderRadius: "999px",
                  padding: "0.7rem 1rem",
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          </div>

          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {navItems.map((item) => {
              const isActive = item.href === pathname;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: "none",
                    color: isActive ? "#08111d" : "#cbd5e1",
                    backgroundColor: isActive ? "#38bdf8" : "#162235",
                    border: `1px solid ${isActive ? "#38bdf8" : "#24324a"}`,
                    borderRadius: "999px",
                    padding: "0.65rem 1rem",
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <section
          style={{
            display: "grid",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#111c30",
              border: "1px solid #24324a",
              borderRadius: "1rem",
              padding: "1.25rem",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#38bdf8",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "0.75rem",
              }}
            >
              {activeItemLabel}
            </p>
            <p
              style={{
                margin: "0.5rem 0 0",
                color: "#cbd5e1",
                lineHeight: 1.6,
              }}
            >
              {description}
            </p>
          </div>

          {children}
        </section>
      </div>

      <AIChatWidget />
    </main>
  );
}

type SessionPillProps = {
  label: string;
  value: string;
};

function SessionPill({ label, value }: SessionPillProps) {
  return (
    <div
      style={{
        backgroundColor: "#0b1220",
        border: "1px solid #334155",
        borderRadius: "999px",
        padding: "0.55rem 0.9rem",
        display: "flex",
        gap: "0.45rem",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: "#94a3b8",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#f8fafc",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}
