"use client";

import type { CSSProperties } from "react";

import type {
  StationSensorSelectionMap,
  StationWithSensors,
} from "./station-sensor-selection";

type StationSensorAssignmentsFieldProps = {
  stations: StationWithSensors[];
  draftStationIds: number[];
  draftSensorIds: number[];
  selections: StationSensorSelectionMap;
  onDraftStationChange: (stationIds: number[]) => void;
  onDraftSensorChange: (sensorIds: number[]) => void;
  onAddSelection: () => void;
  onRemoveStation: (stationId: number) => void;
  disabled?: boolean;
};

export default function StationSensorAssignmentsField({
  stations,
  draftStationIds,
  draftSensorIds,
  selections,
  onDraftStationChange,
  onDraftSensorChange,
  onAddSelection,
  onRemoveStation,
  disabled,
}: StationSensorAssignmentsFieldProps) {
  const sharedSensors = stations
    .filter((station) => draftStationIds.includes(station.station_id))
    .reduce<StationWithSensors["sensors"]>((accumulator, station, index) => {
      if (index === 0) {
        return station.sensors;
      }

      return accumulator.filter((sensor) =>
        station.sensors.some(
          (candidate) => candidate.sensor_type_id === sensor.sensor_type_id
        )
      );
    }, []);
  const committedStations = Object.keys(selections)
    .map((stationId) => stations.find((station) => station.station_id === Number(stationId)))
    .filter((station): station is StationWithSensors => Boolean(station));

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
        alignItems: "start",
      }}
    >
      <div
        style={{
          backgroundColor: "#0b1220",
          border: "1px solid #24324a",
          borderRadius: "0.85rem",
          padding: "1rem",
          display: "grid",
          gap: "0.9rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span style={{ fontWeight: 600, color: "#f8fafc" }}>Station and sensors</span>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Choose one or more stations, pick sensors shared by them, then use `Add` to append the same group to all selected stations.
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gap: "0.9rem",
            gridTemplateColumns: "minmax(13rem, 1fr) minmax(0, 1.35fr)",
            alignItems: "start",
          }}
        >
          <label style={{ display: "grid", gap: "0.45rem" }}>
            <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Station</span>
            <select
              multiple
              disabled={disabled || stations.length === 0}
              value={draftStationIds.map(String)}
              onChange={(event) => {
                const nextValues = Array.from(event.target.selectedOptions).map(
                  (option) => Number(option.value)
                );
                onDraftStationChange(nextValues);
              }}
              style={{
                ...selectStyle,
                minHeight: "10.5rem",
              }}
            >
              {stations.map((station) => (
                <option key={station.station_id} value={station.station_id}>
                  {station.station_name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "0.45rem" }}>
            <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Sensors</span>
            {draftStationIds.length > 0 ? (
              <select
                multiple
                disabled={disabled || sharedSensors.length === 0}
                value={draftSensorIds.map(String)}
                onChange={(event) => {
                  const selectedValues = Array.from(
                    event.target.selectedOptions
                  ).map((option) => Number(option.value));
                  onDraftSensorChange(selectedValues);
                }}
                style={{
                  ...selectStyle,
                  minHeight: "10.5rem",
                }}
              >
                {sharedSensors.map((sensor) => (
                  <option
                    key={sensor.sensor_type_id}
                    value={sensor.sensor_type_id}
                  >
                    {sensor.sensor_name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={emptyStateStyle}>Select one or more stations to load shared sensors.</div>
            )}
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            paddingTop: "0.15rem",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            {draftStationIds.length} stations and {draftSensorIds.length} sensors selected
          </span>
          <button
            type="button"
            disabled={disabled || draftStationIds.length === 0 || draftSensorIds.length === 0}
            onClick={onAddSelection}
            style={addButtonStyle(
              Boolean(disabled || draftStationIds.length === 0 || draftSensorIds.length === 0)
            )}
          >
            Add
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#0b1220",
          border: "1px solid #24324a",
          borderRadius: "0.85rem",
          padding: "1rem",
          display: "grid",
          gap: "0.85rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span style={{ fontWeight: 600, color: "#f8fafc" }}>Selections to run</span>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            This single list contains every station-sensor group that will be used by the query.
          </span>
        </div>
        {committedStations.length === 0 ? (
          <div style={emptyStateStyle}>No station-sensor combinations added yet.</div>
        ) : (
          <div
            style={{
              border: "1px solid #24324a",
              borderRadius: "0.8rem",
              overflow: "hidden",
              minHeight: "100%",
            }}
          >
            {committedStations.map((station, index) => {
              const stationSensorIds = selections[station.station_id] ?? [];
              const sensorLabels = station.sensors
                .filter((sensor) => stationSensorIds.includes(sensor.sensor_type_id))
                .map((sensor) => sensor.sensor_name);

              return (
                <div
                  key={station.station_id}
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "minmax(12rem, 0.8fr) minmax(0, 1.6fr) auto",
                    alignItems: "center",
                    padding: "0.9rem 1rem",
                    backgroundColor: index % 2 === 0 ? "#0f172a" : "#0c1423",
                    borderTop: index === 0 ? "none" : "1px solid #1f2b3f",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        color: "#f8fafc",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {station.station_name}
                    </strong>
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                      {stationSensorIds.length} sensors added
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                    {sensorLabels.map((sensorLabel) => (
                      <span key={`${station.station_id}-${sensorLabel}`} style={sensorChipStyle}>
                        {sensorLabel}
                      </span>
                    ))}
                  </div>

                  <MiniButton
                    label="Remove"
                    disabled={disabled}
                    onClick={() => onRemoveStation(station.station_id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: "1px solid #334155",
        backgroundColor: disabled ? "#0f172a" : "#162235",
        color: disabled ? "#64748b" : "#cbd5e1",
        borderRadius: "0.6rem",
        padding: "0.35rem 0.6rem",
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

const selectStyle: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  padding: "0.75rem 0.85rem",
  fontSize: "0.95rem",
  width: "100%",
};

function addButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "none",
    backgroundColor: disabled ? "#1e293b" : "#0ea5e9",
    color: disabled ? "#94a3b8" : "#08111d",
    borderRadius: "0.65rem",
    padding: "0.55rem 0.9rem",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const emptyStateStyle: CSSProperties = {
  borderRadius: "0.85rem",
  border: "1px dashed #334155",
  backgroundColor: "#0b1220",
  color: "#94a3b8",
  padding: "0.9rem 1rem",
  fontSize: "0.92rem",
};

const sensorChipStyle: CSSProperties = {
  borderRadius: "999px",
  backgroundColor: "#162235",
  border: "1px solid #334155",
  color: "#cbd5e1",
  padding: "0.3rem 0.65rem",
  fontSize: "0.82rem",
};
