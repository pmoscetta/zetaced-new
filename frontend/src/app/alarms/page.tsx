"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import AppShell from "../AppShell";
import PageSection from "../PageSection";
import { fetchProtectedJson } from "../protected-api";

type AlarmSeverity = "alarm" | "warning" | "info";

type AlarmRecord = {
  id: number | null;
  timestamp: string | null;
  date_label: string | null;
  time_label: string | null;
  message: string;
  severity: AlarmSeverity;
};

const REFRESH_INTERVAL_MS = 30_000;

const severityStyles: Record<AlarmSeverity, { color: string; dot: string; label: string }> = {
  alarm: { color: "#fca5a5", dot: "#ef4444", label: "Alarm" },
  warning: { color: "#fcd34d", dot: "#f59e0b", label: "Warning" },
  info: { color: "#e2e8f0", dot: "#38bdf8", label: "Info" },
};

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoadedOnce = useRef(false);

  const loadAlarms = useCallback(async () => {
    if (hasLoadedOnce.current) {
      setIsRefreshing(true);
    }

    try {
      const payload = await fetchProtectedJson<AlarmRecord[]>("/alarms?limit=50");
      setAlarms(payload);
      setError("");
      setLastUpdated(new Date());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the alarm feed."
      );
    } finally {
      hasLoadedOnce.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlarms();
    const intervalId = window.setInterval(loadAlarms, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadAlarms]);

  return (
    <AppShell title="Log / Alarms">
      <PageSection
        title="Alarm Feed"
        actions={
          <button
            type="button"
            onClick={loadAlarms}
            disabled={isLoading || isRefreshing}
            style={buttonStyle(isLoading || isRefreshing)}
          >
            {isRefreshing ? "Refreshing..." : "Refresh now"}
          </button>
        }
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {alarms.length} record{alarms.length === 1 ? "" : "s"} loaded
          </span>
          {lastUpdated ? (
            <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              Last update: {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <StateBox text="Loading the alarm feed..." />
        ) : error ? (
          <StateBox text={error} tone="error" />
        ) : alarms.length === 0 ? (
          <StateBox text="No log messages were returned for this client." />
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #24324a",
              borderRadius: "0.85rem",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "44rem",
              }}
            >
              <thead style={{ backgroundColor: "#0b1220" }}>
                <tr>
                  <HeaderCell>Severity</HeaderCell>
                  <HeaderCell>Date</HeaderCell>
                  <HeaderCell>Time</HeaderCell>
                  <HeaderCell>Message</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {alarms.map((alarm, index) => {
                  const severity = severityStyles[alarm.severity];
                  return (
                    <tr
                      key={`${alarm.id ?? "row"}-${index}`}
                      style={{
                        backgroundColor: index % 2 === 0 ? "#111c30" : "#0d1728",
                      }}
                    >
                      <BodyCell>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            color: severity.color,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            style={{
                              width: "0.6rem",
                              height: "0.6rem",
                              borderRadius: "999px",
                              backgroundColor: severity.dot,
                            }}
                          />
                          {severity.label}
                        </span>
                      </BodyCell>
                      <BodyCell>{alarm.date_label ?? "—"}</BodyCell>
                      <BodyCell>{alarm.time_label ?? "—"}</BodyCell>
                      <BodyCell>
                        <span style={{ color: severity.color }}>
                          {alarm.message || "—"}
                        </span>
                      </BodyCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "0.9rem 1rem",
        borderBottom: "1px solid #24324a",
        color: "#f8fafc",
        fontSize: "0.95rem",
      }}
    >
      {children}
    </th>
  );
}

function BodyCell({ children }: { children: ReactNode }) {
  return (
    <td
      style={{
        padding: "0.85rem 1rem",
        borderBottom: "1px solid #162235",
        color: "#cbd5e1",
        fontSize: "0.95rem",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

type StateBoxProps = {
  text: string;
  tone?: "muted" | "error";
};

function StateBox({ text, tone = "muted" }: StateBoxProps) {
  const colors =
    tone === "error"
      ? { backgroundColor: "#3b1118", border: "#7f1d1d", color: "#fecaca" }
      : { backgroundColor: "#0b1220", border: "#24324a", color: "#cbd5e1" };

  return (
    <div
      style={{
        backgroundColor: colors.backgroundColor,
        border: `1px solid ${colors.border}`,
        color: colors.color,
        borderRadius: "0.85rem",
        padding: "1rem",
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  );
}

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    backgroundColor: disabled ? "#1e293b" : "#0ea5e9",
    color: disabled ? "#94a3b8" : "#08111d",
    border: "none",
    borderRadius: "0.75rem",
    padding: "0.7rem 1rem",
    fontSize: "0.95rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
