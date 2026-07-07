"use client";

import type { CSSProperties } from "react";

import type {
  StationSensorSelectionMap,
  StationWithSensors,
} from "./station-sensor-selection";

type StationSensorAssignmentsFieldProps = {
  stations: StationWithSensors[];
  draftStationId: number | null;
  draftSensorIds: number[];
  selections: StationSensorSelectionMap;
  onDraftStationChange: (stationId: number | null) => void;
  onDraftSensorChange: (sensorIds: number[]) => void;
  onAddSelection: () => void;
  onRemoveStation: (stationId: number) => void;
  disabled?: boolean;
};

export default function StationSensorAssignmentsField({
  stations,
  draftStationId,
  draftSensorIds,
  selections,
  onDraftStationChange,
  onDraftSensorChange,
  onAddSelection,
  onRemoveStation,
  disabled,
}: StationSensorAssignmentsFieldProps) {
  const draftStation =
    stations.find((station) => station.station_id === draftStationId) ?? null;
  const committedStations = Object.keys(selections)
    .map((stationId) => stations.find((station) => station.station_id === Number(stationId)))
    .filter((station): station is StationWithSensors => Boolean(station));

  return (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "grid", gap: "0.2rem" }}>
        <span style={{ fontWeight: 600 }}>Add station and sensors</span>
        <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Build the final query one station at a time, then run it only when the list below is complete.
        </span>
      </div>

      <div
        style={{
          backgroundColor: "#0b1220",
          border: "1px solid #24324a",
          borderRadius: "0.85rem",
          padding: "0.9rem",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <label style={{ display: "grid", gap: "0.45rem" }}>
          <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Station</span>
          <select
            disabled={disabled || stations.length === 0}
            value={draftStationId == null ? "" : String(draftStationId)}
            onChange={(event) => {
              const nextValue = event.target.value;
              onDraftStationChange(nextValue ? Number(nextValue) : null);
            }}
            style={selectStyle}
          >
            <option value="">Select a station</option>
            {stations.map((station) => (
              <option key={station.station_id} value={station.station_id}>
                {station.station_name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.45rem" }}>
          <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Sensors</span>
          {draftStation ? (
            <select
              multiple
              disabled={disabled || draftStation.sensors.length === 0}
              value={draftSensorIds.map(String)}
              onChange={(event) => {
                const selectedValues = Array.from(
                  event.target.selectedOptions
                ).map((option) => Number(option.value));
                onDraftSensorChange(selectedValues);
              }}
              style={{
                ...selectStyle,
                minHeight: "9rem",
              }}
            >
              {draftStation.sensors.map((sensor) => (
                <option
                  key={`${draftStation.station_id}-${sensor.sensor_type_id}`}
                  value={sensor.sensor_type_id}
                >
                  {sensor.sensor_name}
                </option>
              ))}
            </select>
          ) : (
            <div style={emptyStateStyle}>Select a station to load its sensors.</div>
          )}
        </label>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            {draftSensorIds.length} sensors selected for the current station
          </span>
          <button
            type="button"
            disabled={disabled || draftStationId == null || draftSensorIds.length === 0}
            onClick={onAddSelection}
            style={addButtonStyle(
              Boolean(disabled || draftStationId == null || draftSensorIds.length === 0)
            )}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.4rem" }}>
        <span style={{ fontWeight: 600 }}>Selections to run</span>
        {committedStations.length === 0 ? (
          <div style={emptyStateStyle}>No station-sensor combinations added yet.</div>
        ) : (
        <div
          style={{
            display: "grid",
            gap: "0.85rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          }}
        >
          {committedStations.map((station) => {
            const stationSensorIds = selections[station.station_id] ?? [];
            const sensorLabels = station.sensors
              .filter((sensor) => stationSensorIds.includes(sensor.sensor_type_id))
              .map((sensor) => sensor.sensor_name);

            return (
              <div
                key={station.station_id}
                style={{
                  backgroundColor: "#0b1220",
                  border: "1px solid #24324a",
                  borderRadius: "0.85rem",
                  padding: "0.9rem",
                  display: "grid",
                  gap: "0.7rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
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

                  <MiniButton
                    label="Remove"
                    disabled={disabled}
                    onClick={() => onRemoveStation(station.station_id)}
                  />
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {sensorLabels.map((sensorLabel) => (
                    <span key={`${station.station_id}-${sensorLabel}`} style={sensorChipStyle}>
                      {sensorLabel}
                    </span>
                  ))}
                </div>
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
