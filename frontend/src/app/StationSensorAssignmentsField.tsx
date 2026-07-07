"use client";

import type { CSSProperties } from "react";

import type {
  StationSensorSelectionMap,
  StationWithSensors,
} from "./station-sensor-selection";

type StationSensorAssignmentsFieldProps = {
  stations: StationWithSensors[];
  selectedStationIds: number[];
  value: StationSensorSelectionMap;
  onChange: (value: StationSensorSelectionMap) => void;
  disabled?: boolean;
};

export default function StationSensorAssignmentsField({
  stations,
  selectedStationIds,
  value,
  onChange,
  disabled,
}: StationSensorAssignmentsFieldProps) {
  const selectedStations = selectedStationIds
    .map((stationId) => stations.find((station) => station.station_id === stationId))
    .filter((station): station is StationWithSensors => Boolean(station));

  return (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "grid", gap: "0.2rem" }}>
        <span style={{ fontWeight: 600 }}>Sensors by station</span>
        <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Each station can use a different sensor selection.
        </span>
      </div>

      {selectedStations.length === 0 ? (
        <div style={emptyStateStyle}>Select one or more stations first.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "0.85rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          }}
        >
          {selectedStations.map((station) => {
            const stationSensorIds = value[station.station_id] ?? [];

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
                      {station.sensors.length} available sensors
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "0.45rem", flexShrink: 0 }}>
                    <MiniButton
                      label="All"
                      disabled={disabled || station.sensors.length === 0}
                      onClick={() => {
                        onChange({
                          ...value,
                          [station.station_id]: station.sensors.map(
                            (sensor) => sensor.sensor_type_id
                          ),
                        });
                      }}
                    />
                    <MiniButton
                      label="None"
                      disabled={disabled}
                      onClick={() => {
                        onChange({
                          ...value,
                          [station.station_id]: [],
                        });
                      }}
                    />
                  </div>
                </div>

                {station.sensors.length === 0 ? (
                  <div style={emptyStateStyle}>No visible sensors for this station.</div>
                ) : (
                  <select
                    multiple
                    disabled={disabled}
                    value={stationSensorIds.map(String)}
                    onChange={(event) => {
                      const selectedValues = Array.from(
                        event.target.selectedOptions
                      ).map((option) => Number(option.value));

                      onChange({
                        ...value,
                        [station.station_id]: selectedValues,
                      });
                    }}
                    style={{
                      ...selectStyle,
                      minHeight: "9rem",
                    }}
                  >
                    {station.sensors.map((sensor) => (
                      <option
                        key={`${station.station_id}-${sensor.sensor_type_id}`}
                        value={sensor.sensor_type_id}
                      >
                        {sensor.sensor_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
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

const emptyStateStyle: CSSProperties = {
  borderRadius: "0.85rem",
  border: "1px dashed #334155",
  backgroundColor: "#0b1220",
  color: "#94a3b8",
  padding: "0.9rem 1rem",
  fontSize: "0.92rem",
};
