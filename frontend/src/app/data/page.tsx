"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import AppShell from "../AppShell";
import DateTimePickerField from "../DateTimePickerField";
import PaginationControls from "../PaginationControls";
import PageSection from "../PageSection";
import { fetchProtectedJson } from "../protected-api";

type StationOption = {
  station_id: number;
  station_name: string;
};

type SensorOption = {
  sensor_type_id: number;
  sensor_name: string;
};

type DataColumn = {
  column_key: string;
  station_id: number;
  station_name: string;
  sensor_type_id: number;
  sensor_name: string;
};

type DataRow = {
  timestamp: string;
  date_label: string;
  time_labels: string[];
  values: Record<string, number | null>;
};

type DataResponse = {
  columns: DataColumn[];
  rows: DataRow[];
};

const DATA_PAGE_SIZE = 100;

export default function DataPage() {
  const [stations, setStations] = useState<StationOption[]>([]);
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);
  const [selectedSensorIds, setSelectedSensorIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | null>(getDefaultDateFrom());
  const [dateTo, setDateTo] = useState<Date | null>(getDefaultDateTo());
  const [alignmentSeconds, setAlignmentSeconds] = useState("300");
  const [results, setResults] = useState<DataResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [error, setError] = useState("");

  const hasFilters = selectedStationIds.length > 0 && selectedSensorIds.length > 0;

  useEffect(() => {
    async function loadMetadata() {
      try {
        setError("");
        const [stationPayload, sensorPayload] = await Promise.all([
          fetchProtectedJson<
            Array<{
              station_id: number;
              station_name: string;
            }>
          >("/stations?view=results"),
          fetchProtectedJson<SensorOption[]>("/sensors?view=results"),
        ]);

        const stationOptions = stationPayload.map((station) => ({
          station_id: station.station_id,
          station_name: station.station_name,
        }));

        setStations(stationOptions);
        setSensors(sensorPayload);

        const defaultStationIds = stationOptions[0]
          ? [stationOptions[0].station_id]
          : [];
        const defaultSensorIds = sensorPayload
          .slice(0, 3)
          .map((sensor) => sensor.sensor_type_id);

        setSelectedStationIds(defaultStationIds);
        setSelectedSensorIds(defaultSensorIds);

        if (defaultStationIds.length > 0 && defaultSensorIds.length > 0) {
          await loadData(
            defaultStationIds,
            defaultSensorIds,
            getDefaultDateFrom(),
            getDefaultDateTo(),
            "300"
          );
        }
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load data filters."
        );
      } finally {
        setIsBootstrapping(false);
      }
    }

    loadMetadata();
  }, []);

  const visibleColumns = useMemo(() => results?.columns ?? [], [results]);
  const allRows = useMemo(() => results?.rows ?? [], [results]);
  const totalPages = Math.max(1, Math.ceil(allRows.length / DATA_PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const startIndex = (currentPage - 1) * DATA_PAGE_SIZE;
    return allRows.slice(startIndex, startIndex + DATA_PAGE_SIZE);
  }, [allRows, currentPage]);

  async function loadData(
    stationIds: number[],
    sensorIds: number[],
    requestedDateFrom: Date | null,
    requestedDateTo: Date | null,
    requestedAlignmentSeconds: string
  ) {
    if (stationIds.length === 0 || sensorIds.length === 0) {
      setResults(null);
      setCurrentPage(1);
      return;
    }

    setIsLoadingResults(true);

    try {
      const params = new URLSearchParams();
      stationIds.forEach((stationId) => {
        params.append("station_ids", String(stationId));
      });
      sensorIds.forEach((sensorId) => {
        params.append("sensor_ids", String(sensorId));
      });
      if (requestedDateFrom) {
        params.set("date_from", requestedDateFrom.toISOString());
      }
      if (requestedDateTo) {
        params.set("date_to", requestedDateTo.toISOString());
      }
      params.set("alignment_seconds", requestedAlignmentSeconds || "300");

      const payload = await fetchProtectedJson<DataResponse>(
        `/data?${params.toString()}`
      );
      setResults(payload);
      setCurrentPage(1);
      setError("");
    } catch (caughtError) {
      setResults(null);
      setCurrentPage(1);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load aligned data."
      );
    } finally {
      setIsLoadingResults(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData(
      selectedStationIds,
      selectedSensorIds,
      dateFrom,
      dateTo,
      alignmentSeconds
    );
  }

  function openChartPopup() {
    if (!hasFilters) {
      return;
    }

    const params = new URLSearchParams();
    selectedStationIds.forEach((stationId) => {
      params.append("station_ids", String(stationId));
    });
    selectedSensorIds.forEach((sensorId) => {
      params.append("sensor_ids", String(sensorId));
    });
    if (dateFrom) {
      params.set("date_from", dateFrom.toISOString());
    }
    if (dateTo) {
      params.set("date_to", dateTo.toISOString());
    }
    params.set("alignment_seconds", alignmentSeconds || "300");
    params.set("popup", "1");

    const popupUrl = `/chart?${params.toString()}`;
    const popupName = `zetaced-chart-${Date.now()}`;
    window.open(
      popupUrl,
      popupName,
      "popup=yes,width=1440,height=900,resizable=yes,scrollbars=yes"
    );
  }

  function goToPreviousPage() {
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  return (
    <AppShell
      title="Aligned Data"
      description="This screen now runs against the real protected `/api/data` endpoint with live station and sensor filters."
    >
      <PageSection
        title="Data Filters"
        description="The default query loads one station and the first three sensors from the last 24 hours so the page stays fast while we validate the product."
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            }}
          >
            <MultiSelectField
              label="Stations"
              options={stations.map((station) => ({
                value: station.station_id,
                label: station.station_name,
              }))}
              value={selectedStationIds}
              onChange={setSelectedStationIds}
              disabled={isBootstrapping}
            />
            <MultiSelectField
              label="Sensors"
              options={sensors.map((sensor) => ({
                value: sensor.sensor_type_id,
                label: sensor.sensor_name,
              }))}
              value={selectedSensorIds}
              onChange={setSelectedSensorIds}
              disabled={isBootstrapping}
            />
            <DateTimePickerField
              label="From"
              selected={dateFrom}
              onChange={setDateFrom}
            />
            <DateTimePickerField
              label="To"
              selected={dateTo}
              onChange={setDateTo}
            />
            <Field
              label="Alignment seconds"
              type="number"
              value={alignmentSeconds}
              onChange={setAlignmentSeconds}
              min="0"
              max="3600"
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <button
              type="submit"
              disabled={!hasFilters || isBootstrapping || isLoadingResults}
              style={buttonStyle(!hasFilters || isBootstrapping || isLoadingResults)}
            >
              {isLoadingResults ? "Loading data..." : "Run query"}
            </button>
            <span
              style={{
                color: "#94a3b8",
                fontSize: "0.95rem",
              }}
            >
              Current result: {allRows.length} rows, {visibleColumns.length} columns
            </span>
          </div>
        </form>
      </PageSection>

      <PageSection
        title="Aligned Results"
        description="The table below groups readings by the selected alignment window and renders one column for each requested station and sensor combination."
        actions={
          <button
            type="button"
            onClick={openChartPopup}
            disabled={!hasFilters || isBootstrapping || isLoadingResults}
            style={buttonStyle(!hasFilters || isBootstrapping || isLoadingResults)}
          >
            Open chart window
          </button>
        }
      >
        {isBootstrapping ? (
          <StateBox text="Loading filter metadata..." />
        ) : error ? (
          <StateBox text={error} tone="error" />
        ) : !results ? (
          <StateBox
            text="Choose at least one station and one sensor, then run the query."
          />
        ) : visibleRows.length === 0 ? (
          <StateBox text="No aligned rows were returned for the current filter set." />
        ) : (
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              summary={buildPageSummary(allRows.length, currentPage, DATA_PAGE_SIZE)}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />

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
                  minWidth: `${Math.max(48, 18 + visibleColumns.length * 10)}rem`,
                }}
              >
                <thead
                  style={{
                    backgroundColor: "#0b1220",
                  }}
                >
                  <tr>
                    <HeaderCell>Date</HeaderCell>
                    <HeaderCell>Time</HeaderCell>
                    {visibleColumns.map((column) => (
                      <HeaderCell key={column.column_key}>
                        <div>{column.station_name}</div>
                        <div
                          style={{
                            marginTop: "0.25rem",
                            color: "#cbd5e1",
                            fontWeight: 500,
                            fontSize: "0.85rem",
                            lineHeight: 1.35,
                          }}
                        >
                          {column.sensor_name}
                        </div>
                      </HeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, index) => (
                    <tr
                      key={`${row.timestamp}-${currentPage}-${index}`}
                      style={{
                        backgroundColor: index % 2 === 0 ? "#111c30" : "#0d1728",
                      }}
                    >
                      <BodyCell>{row.date_label}</BodyCell>
                      <BodyCell>
                        <div
                          style={{
                            display: "grid",
                            gap: "0.15rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.time_labels.map((timeLabel) => (
                            <span key={timeLabel}>{timeLabel}</span>
                          ))}
                        </div>
                      </BodyCell>
                      {visibleColumns.map((column) => (
                        <BodyCell key={column.column_key}>
                          {formatTableValue(row.values[column.column_key] ?? null)}
                        </BodyCell>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {results && allRows.length > DATA_PAGE_SIZE ? (
          <p
            style={{
              marginTop: "0.9rem",
              marginBottom: 0,
              color: "#94a3b8",
              lineHeight: 1.6,
            }}
          >
            Use the arrows to browse the result set in blocks of {DATA_PAGE_SIZE} rows.
            The API returned {allRows.length} rows total.
          </p>
        ) : null}
      </PageSection>
    </AppShell>
  );
}

type FieldProps = {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
};

function Field({ label, type, value, onChange, min, max }: FieldProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "0.45rem",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

type MultiSelectFieldProps = {
  label: string;
  options: Array<{ value: number; label: string }>;
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
};

function MultiSelectField({
  label,
  options,
  value,
  onChange,
  disabled,
}: MultiSelectFieldProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "0.45rem",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <select
        multiple
        disabled={disabled}
        value={value.map(String)}
        onChange={(event) => {
          const selectedValues = Array.from(event.target.selectedOptions).map(
            (option) => Number(option.value)
          );
          onChange(selectedValues);
        }}
        style={{
          ...inputStyle,
          minHeight: "10rem",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

const inputStyle: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid #334155",
  backgroundColor: "#0b1220",
  color: "#f8fafc",
  padding: "0.9rem 1rem",
  fontSize: "1rem",
};

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    backgroundColor: disabled ? "#1e293b" : "#0ea5e9",
    color: disabled ? "#94a3b8" : "#08111d",
    border: "none",
    borderRadius: "0.75rem",
    padding: "0.9rem 1rem",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function formatTableValue(value: number | null) {
  if (value === null) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getDefaultDateFrom() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function getDefaultDateTo() {
  return new Date();
}

function buildPageSummary(totalRows: number, currentPage: number, pageSize: number) {
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalRows, currentPage * pageSize);

  return `Showing rows ${startIndex}-${endIndex} of ${totalRows}`;
}
