"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import AppShell from "../AppShell";
import PageSection from "../PageSection";
import { fetchProtectedJson } from "../protected-api";
import {
  formatCoordinate,
  formatDateTime,
  formatValue,
  getStationCoordinates,
  type StationSummary,
} from "./map-utils";

const StationsLeafletMap = dynamic(() => import("./StationsLeafletMap"), {
  ssr: false,
  loading: () => <StateBox text="Preparing the interactive map..." />,
});

export default function MapPage() {
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const loadStations = useCallback(async (refresh = false) => {
    try {
      setError("");
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const payload = await fetchProtectedJson<StationSummary[]>(
        "/stations?view=monitor"
      );
      setStations(payload);
      setLastLoadedAt(new Date().toISOString());
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load stations."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStations();

    const refreshTimer = window.setInterval(() => {
      void loadStations(true);
    }, 60000);

    return () => window.clearInterval(refreshTimer);
  }, [loadStations]);

  const mappedStationsCount = useMemo(
    () => stations.filter((station) => getStationCoordinates(station)).length,
    [stations]
  );
  const hiddenStationsCount = stations.length - mappedStationsCount;

  return (
    <AppShell
      title="Monitoring Map"
      description="Interactive Leaflet map of the authenticated tenant stations with live sensor popups and automatic refresh every 60 seconds."
    >
      <PageSection
        title="Station Map"
        description="The map uses the same protected `/api/stations` payload and plots every station that has valid coordinates."
        actions={
          <button
            onClick={() => void loadStations(true)}
            disabled={isLoading || isRefreshing}
            style={{
              border: "1px solid #334155",
              backgroundColor: isLoading || isRefreshing ? "#162235" : "#0b1220",
              color: "#f8fafc",
              borderRadius: "999px",
              padding: "0.7rem 1rem",
              fontSize: "0.95rem",
              cursor: isLoading || isRefreshing ? "wait" : "pointer",
            }}
          >
            {isRefreshing ? "Refreshing..." : "Refresh map"}
          </button>
        }
      >
        {isLoading ? (
          <StateBox text="Loading stations from the tenant database..." />
        ) : error ? (
          <StateBox text={error} tone="error" />
        ) : stations.length === 0 ? (
          <StateBox text="No stations were returned for this client." tone="muted" />
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                color: "#cbd5e1",
                fontSize: "0.95rem",
              }}
            >
              <StatusPill label="Mapped" value={`${mappedStationsCount}/${stations.length}`} />
              <StatusPill label="Hidden" value={String(hiddenStationsCount)} />
              <StatusPill label="Last sync" value={formatDateTime(lastLoadedAt)} />
            </div>

            {hiddenStationsCount > 0 ? (
              <StateBox
                text={`${hiddenStationsCount} station${hiddenStationsCount === 1 ? "" : "s"} could not be placed on the map because latitude or longitude is missing.`}
              />
            ) : null}

            <StationsLeafletMap stations={stations} />
          </div>
        )}
      </PageSection>

      <PageSection
        title="Station Overview"
        description="Compact station tables keep the latest readings visible without taking as much space as the previous cards."
      >
        {isLoading ? (
          <StateBox text="Loading station cards..." />
        ) : error ? (
          <StateBox text={error} tone="error" />
        ) : stations.length === 0 ? (
          <StateBox text="No stations were returned for this client." tone="muted" />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "0.9rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(21rem, 1fr))",
            }}
          >
            {stations.map((station) => (
              <CompactStationTable key={station.station_id} station={station} />
            ))}
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}

type StateBoxProps = {
  text: string;
  tone?: "muted" | "error";
};

function StateBox({ text, tone = "muted" }: StateBoxProps) {
  const colors =
    tone === "error"
      ? {
          backgroundColor: "#3b1118",
          border: "#7f1d1d",
          color: "#fecaca",
        }
      : {
          backgroundColor: "#0b1220",
          border: "#24324a",
          color: "#cbd5e1",
        };

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

type StatusPillProps = {
  label: string;
  value: string;
};

function StatusPill({ label, value }: StatusPillProps) {
  return (
    <div
      style={{
        backgroundColor: "#0b1220",
        border: "1px solid #24324a",
        borderRadius: "999px",
        padding: "0.55rem 0.85rem",
        display: "flex",
        gap: "0.5rem",
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

type CompactStationTableProps = {
  station: StationSummary;
};

function CompactStationTable({ station }: CompactStationTableProps) {
  return (
    <article
      style={{
        border: "1px solid #3148c9",
        borderRadius: "0.2rem",
        backgroundColor: "#ffffff",
        overflow: "hidden",
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div
        style={{
          backgroundColor: "#151a8b",
          color: "#ffffff",
          padding: "0.35rem 0.55rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          fontSize: "0.86rem",
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        <span>
          {station.station_name} ({String(station.station_id).padStart(2, "0")}) -
        </span>
        <span>{station.latest_update ? "Latest" : "No data"}</span>
      </div>

      {station.sensors.length === 0 ? (
        <div
          style={{
            padding: "0.8rem",
            fontSize: "0.82rem",
            color: "#475569",
          }}
        >
          No latest sensor data available.
        </div>
      ) : (
        <div
          style={{
            padding: "0.55rem",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.79rem",
              color: "#0f172a",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#151a8b", color: "#ffffff" }}>
                <th style={compactHeaderCellStyle}>Sensor</th>
                <th style={compactHeaderCellStyle}>Value</th>
                <th style={compactHeaderCellStyle}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {station.sensors.map((sensor) => (
                <tr key={`${station.station_id}-${sensor.sensor_id ?? sensor.sensor_name}`}>
                  <td style={compactBodyCellStyle}>{sensor.sensor_name}</td>
                  <td style={compactBodyCellStyle}>{formatValue(sensor.last_value)}</td>
                  <td style={compactBodyCellStyle}>{formatCompactDateTime(sensor.last_update)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              marginTop: "0.45rem",
              fontSize: "0.72rem",
              color: "#475569",
            }}
          >
            Coords: {formatCoordinate(station.latitude)}, {formatCoordinate(station.longitude)}
          </div>
        </div>
      )}
    </article>
  );
}

const compactHeaderCellStyle: CSSProperties = {
  padding: "0.33rem 0.45rem",
  border: "1px solid #5060c7",
  textAlign: "left",
  fontWeight: 700,
};

const compactBodyCellStyle: CSSProperties = {
  padding: "0.28rem 0.45rem",
  border: "1px solid #cbd5e1",
  verticalAlign: "top",
};

function formatCompactDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
