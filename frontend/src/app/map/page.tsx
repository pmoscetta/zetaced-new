"use client";

import { useEffect, useState } from "react";

import AppShell from "../AppShell";
import PageSection from "../PageSection";
import { fetchProtectedJson } from "../protected-api";

type StationSensor = {
  sensor_id: number | null;
  sensor_type_id: number | null;
  sensor_name: string;
  last_value: number | null;
  last_update: string | null;
};

type StationSummary = {
  station_id: number;
  station_name: string;
  latitude: number | null;
  longitude: number | null;
  latest_update: string | null;
  sensors: StationSensor[];
};

export default function MapPage() {
  const [stations, setStations] = useState<StationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStations() {
      try {
        setError("");
        const payload = await fetchProtectedJson<StationSummary[]>(
          "/stations?view=monitor"
        );
        setStations(payload);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load stations."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadStations();
  }, []);

  return (
    <AppShell
      title="Monitoring Map"
      description="The first authenticated data view is now connected to the protected stations endpoint. A map layer can be added on top of the same payload next."
    >
      <PageSection
        title="Station Overview"
        description="This list is being loaded from `/api/stations` with the bearer token stored during login."
      >
        {isLoading ? (
          <StateBox text="Loading stations from the tenant database..." />
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

function formatCoordinate(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return value.toFixed(5);
}

function formatValue(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
