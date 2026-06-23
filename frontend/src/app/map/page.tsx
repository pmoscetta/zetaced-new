"use client";

import dynamic from "next/dynamic";
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
        description="Cards remain available below the map for quick scanning of sensor values and timestamps."
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
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
            }}
          >
            {stations.map((station) => (
              <article
                key={station.station_id}
                style={{
                  backgroundColor: "#0b1220",
                  border: "1px solid #24324a",
                  borderRadius: "0.9rem",
                  padding: "1rem",
                  display: "grid",
                  gap: "0.85rem",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                    }}
                  >
                    {station.station_name}
                  </h3>
                  <p
                    style={{
                      margin: "0.35rem 0 0",
                      color: "#94a3b8",
                      fontSize: "0.95rem",
                    }}
                  >
                    Station #{station.station_id}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.35rem",
                    color: "#cbd5e1",
                    fontSize: "0.95rem",
                  }}
                >
                  <div>
                    Coordinates: {formatCoordinate(station.latitude)},{" "}
                    {formatCoordinate(station.longitude)}
                  </div>
                  <div>
                    Latest update: {formatDateTime(station.latest_update)}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.45rem",
                    gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
                  }}
                >
                  {station.sensors.length === 0 ? (
                    <div
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.95rem",
                      }}
                    >
                      No latest sensor data available.
                    </div>
                  ) : (
                    station.sensors.map((sensor) => (
                      <div
                        key={`${station.station_id}-${sensor.sensor_id ?? sensor.sensor_name}`}
                        style={{
                          backgroundColor: "#111c30",
                          border: "1px solid #1f2b3f",
                          borderRadius: "0.75rem",
                          padding: "0.75rem 0.85rem",
                          color: "#cbd5e1",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#f8fafc",
                          }}
                        >
                          {sensor.sensor_name}
                        </div>
                        <div style={{ marginTop: "0.25rem" }}>
                          Value: {formatValue(sensor.last_value)}
                        </div>
                        <div style={{ marginTop: "0.2rem", color: "#94a3b8" }}>
                          Updated: {formatDateTime(sensor.last_update)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
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
