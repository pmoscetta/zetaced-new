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

type ChartPoint = {
  timestamp: string;
  value: number;
};

type ChartSeries = {
  series_key: string;
  station_id: number;
  station_name: string;
  sensor_type_id: number;
  sensor_name: string;
  points: ChartPoint[];
};

type ChartResponse = {
  series: ChartSeries[];
};

type HoveredPoint = {
  stationName: string;
  sensorName: string;
  timestamp: string;
  value: number;
  x: number;
  y: number;
  color: string;
};

const CHART_PAGE_SIZE = 100;
const seriesColors = [
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#a78bfa",
  "#ef4444",
  "#14b8a6",
  "#e879f9",
  "#f97316",
];

export default function ChartPage() {
  const [popupMode, setPopupMode] = useState(false);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);
  const [selectedSensorIds, setSelectedSensorIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | null>(getDefaultDateFrom());
  const [dateTo, setDateTo] = useState<Date | null>(getDefaultDateTo());
  const [results, setResults] = useState<ChartResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPage() {
      try {
        setError("");
        const popupConfig = getPopupChartConfig();
        if (popupConfig) {
          setPopupMode(true);
          setSelectedStationIds(popupConfig.stationIds);
          setSelectedSensorIds(popupConfig.sensorIds);
          setDateFrom(popupConfig.dateFrom);
          setDateTo(popupConfig.dateTo);

          if (popupConfig.stationIds.length === 0 || popupConfig.sensorIds.length === 0) {
            setResults(null);
            setError("Missing chart filters.");
            return;
          }

          await loadChart(
            popupConfig.stationIds,
            popupConfig.sensorIds,
            popupConfig.dateFrom,
            popupConfig.dateTo
          );
          return;
        }

        setPopupMode(false);
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
          await loadChart(
            defaultStationIds,
            defaultSensorIds,
            getDefaultDateFrom(),
            getDefaultDateTo()
          );
        }
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load chart filters."
        );
      } finally {
        setIsBootstrapping(false);
      }
    }

    loadPage();
  }, []);

  const allSeries = useMemo(() => results?.series ?? [], [results]);
  const allTimestamps = useMemo(() => {
    const uniqueTimestamps = new Set<string>();
    for (const series of allSeries) {
      for (const point of series.points) {
        uniqueTimestamps.add(point.timestamp);
      }
    }

    return Array.from(uniqueTimestamps).sort(
      (left, right) => new Date(left).getTime() - new Date(right).getTime()
    );
  }, [allSeries]);
  const totalPages = Math.max(1, Math.ceil(allTimestamps.length / CHART_PAGE_SIZE));
  const visibleTimestampKeys = useMemo(() => {
    const startIndex = (currentPage - 1) * CHART_PAGE_SIZE;
    return allTimestamps.slice(startIndex, startIndex + CHART_PAGE_SIZE);
  }, [allTimestamps, currentPage]);
  const visibleTimestampSet = useMemo(
    () => new Set(visibleTimestampKeys),
    [visibleTimestampKeys]
  );
  const visibleSeries = useMemo(() => {
    return allSeries
      .map((series) => ({
        ...series,
        points: series.points.filter((point) => visibleTimestampSet.has(point.timestamp)),
      }))
      .filter((series) => series.points.length > 0);
  }, [allSeries, visibleTimestampSet]);
  const chartGeometry = useMemo(() => buildChartGeometry(visibleSeries), [visibleSeries]);

  async function loadChart(
    stationIds: number[],
    sensorIds: number[],
    requestedDateFrom: Date | null,
    requestedDateTo: Date | null
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

      const payload = await fetchProtectedJson<ChartResponse>(
        `/chart?${params.toString()}`
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
          : "Unable to load chart data."
      );
    } finally {
      setIsLoadingResults(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadChart(selectedStationIds, selectedSensorIds, dateFrom, dateTo);
  }

  function goToPreviousPage() {
    setHoveredPoint(null);
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setHoveredPoint(null);
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  function handleSeriesHover(
    event: React.MouseEvent<SVGPathElement>,
    series: (typeof chartGeometry.series)[number],
    color: string
  ) {
    const svgElement = event.currentTarget.ownerSVGElement;
    if (!svgElement || series.points.length === 0) {
      return;
    }

    const rect = svgElement.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 960;
    const closestPoint = series.points.reduce((closest, candidate) => {
      if (!closest) {
        return candidate;
      }

      return Math.abs(candidate.x - pointerX) < Math.abs(closest.x - pointerX)
        ? candidate
        : closest;
    }, series.points[0]);

    setHoveredPoint({
      stationName: series.station_name,
      sensorName: series.sensor_name,
      timestamp: closestPoint.timestamp,
      value: closestPoint.value,
      x: closestPoint.x,
      y: closestPoint.y,
      color,
    });
  }

  return (
    <AppShell
      title={popupMode ? "Chart Window" : "Charts"}
      description={
        popupMode
          ? "This popup charts the current selection opened from DATA. You can open multiple chart windows to compare different selections."
          : "This screen now consumes the protected `/api/chart` endpoint and renders a lightweight live chart without adding a chart library yet."
      }
    >
      {!popupMode ? (
        <PageSection
          title="Chart Filters"
          description="The default chart uses one station, three sensors, and the last 24 hours so we can validate the real chart flow on live tenant data."
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
                disabled={
                  selectedStationIds.length === 0 ||
                  selectedSensorIds.length === 0 ||
                  isBootstrapping ||
                  isLoadingResults
                }
                style={buttonStyle(
                  selectedStationIds.length === 0 ||
                    selectedSensorIds.length === 0 ||
                    isBootstrapping ||
                    isLoadingResults
                )}
              >
                {isLoadingResults ? "Loading chart..." : "Load chart"}
              </button>
              <span
                style={{
                  color: "#94a3b8",
                  fontSize: "0.95rem",
                }}
              >
                Current result: {allSeries.length} series, {allTimestamps.length} timestamps
              </span>
            </div>
          </form>
        </PageSection>
      ) : null}

      <PageSection
        title="Chart Preview"
        description={
          popupMode
            ? "This window renders the chart for the filters selected in DATA."
            : "Each line represents one station and sensor combination returned by `/api/chart`."
        }
        actions={
          visibleSeries.length > 0 ? (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              summary={buildPageSummary(allTimestamps.length, currentPage, CHART_PAGE_SIZE)}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          ) : null
        }
      >
        {isBootstrapping ? (
          <StateBox text="Loading chart filters..." />
        ) : error ? (
          <StateBox text={error} tone="error" />
        ) : !results ? (
          <StateBox text="Choose at least one station and one sensor, then load the chart." />
        ) : visibleSeries.length === 0 ? (
          <StateBox text="No chart points were returned for the current filter set." />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "1rem",
            }}
          >
            <div
              style={{
                backgroundColor: "#0b1220",
                border: "1px solid #24324a",
                borderRadius: "0.85rem",
                padding: "1rem",
                overflowX: "auto",
              }}
            >
              <svg
                viewBox="0 0 960 360"
                style={{
                  width: "100%",
                  minWidth: "42rem",
                  height: "22rem",
                  display: "block",
                }}
              >
                <rect x="0" y="0" width="960" height="360" fill="#0b1220" />
                {chartGeometry.gridLines.map((line) => (
                  <line
                    key={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#1f2b3f"
                    strokeWidth="1"
                  />
                ))}
                {chartGeometry.series.map((series, index) => (
                  <g key={series.series_key}>
                    <path
                      d={series.path}
                      fill="none"
                      stroke={seriesColors[index % seriesColors.length]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={series.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="16"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      onMouseMove={(event) =>
                        handleSeriesHover(
                          event,
                          series,
                          seriesColors[index % seriesColors.length]
                        )
                      }
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                ))}
                {hoveredPoint ? (
                  <g pointerEvents="none">
                    <circle
                      cx={hoveredPoint.x}
                      cy={hoveredPoint.y}
                      r="5"
                      fill={hoveredPoint.color}
                      stroke="#f8fafc"
                      strokeWidth="2"
                    />
                    <rect
                      x={hoveredPoint.x > 760 ? hoveredPoint.x - 190 : hoveredPoint.x + 12}
                      y={hoveredPoint.y < 90 ? hoveredPoint.y + 12 : hoveredPoint.y - 70}
                      rx="10"
                      ry="10"
                      width="178"
                      height="58"
                      fill="#08111d"
                      stroke="#334155"
                    />
                    <text
                      x={hoveredPoint.x > 760 ? hoveredPoint.x - 178 : hoveredPoint.x + 24}
                      y={hoveredPoint.y < 90 ? hoveredPoint.y + 32 : hoveredPoint.y - 50}
                      fill="#f8fafc"
                      fontSize="12"
                      fontWeight="700"
                    >
                      {hoveredPoint.stationName} - {hoveredPoint.sensorName}
                    </text>
                    <text
                      x={hoveredPoint.x > 760 ? hoveredPoint.x - 178 : hoveredPoint.x + 24}
                      y={hoveredPoint.y < 90 ? hoveredPoint.y + 48 : hoveredPoint.y - 34}
                      fill="#cbd5e1"
                      fontSize="11"
                    >
                      {formatTooltipTimestamp(hoveredPoint.timestamp)}
                    </text>
                    <text
                      x={hoveredPoint.x > 760 ? hoveredPoint.x - 178 : hoveredPoint.x + 24}
                      y={hoveredPoint.y < 90 ? hoveredPoint.y + 64 : hoveredPoint.y - 18}
                      fill="#38bdf8"
                      fontSize="12"
                      fontWeight="700"
                    >
                      Value: {formatValue(hoveredPoint.value)}
                    </text>
                  </g>
                ) : null}
              </svg>
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
              }}
            >
              {visibleSeries.map((series, index) => (
                <div
                  key={series.series_key}
                  style={{
                    backgroundColor: "#111c30",
                    border: "1px solid #24324a",
                    borderRadius: "0.85rem",
                    padding: "1rem",
                    display: "grid",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                    }}
                  >
                    <span
                      style={{
                        width: "0.9rem",
                        height: "0.9rem",
                        borderRadius: "999px",
                        backgroundColor: seriesColors[index % seriesColors.length],
                        display: "inline-block",
                      }}
                    />
                    <strong>{series.station_name}</strong>
                  </div>
                  <div style={{ color: "#cbd5e1" }}>{series.sensor_name}</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                    Points on page: {series.points.length}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                    Range on page: {formatSeriesRange(series.points)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}

type FieldProps = {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
};

function Field({ label, type, value, onChange }: FieldProps) {
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

function buildChartGeometry(series: ChartSeries[]) {
  const allPoints = series.flatMap((entry) => entry.points);
  if (allPoints.length === 0) {
    return {
      gridLines: [] as Array<{
        key: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }>,
      series: [] as Array<{
        series_key: string;
        station_name: string;
        sensor_name: string;
        path: string;
        points: Array<{
          x: number;
          y: number;
          timestamp: string;
          value: number;
        }>;
      }>,
    };
  }

  const chartWidth = 960;
  const chartHeight = 360;
  const left = 40;
  const right = 24;
  const top = 24;
  const bottom = 32;

  const timestamps = allPoints.map((point) => new Date(point.timestamp).getTime());
  const values = allPoints.map((point) => point.value);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const safeTimeRange = Math.max(maxTime - minTime, 1);
  const safeValueRange = Math.max(maxValue - minValue, 1);

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = top + ratio * (chartHeight - top - bottom);
    return {
      key: `grid-${index}`,
      x1: left,
      y1: y,
      x2: chartWidth - right,
      y2: y,
    };
  });

  return {
    gridLines,
    series: series.map((entry) => {
      const plottedPoints = entry.points.map((point) => {
        const timeValue = new Date(point.timestamp).getTime();
        const x =
          left +
          ((timeValue - minTime) / safeTimeRange) * (chartWidth - left - right);
        const y =
          chartHeight -
          bottom -
          ((point.value - minValue) / safeValueRange) * (chartHeight - top - bottom);

        return {
          x,
          y,
          timestamp: point.timestamp,
          value: point.value,
        };
      });

      const path = plottedPoints
        .map((point, index) => {
          return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        })
        .join(" ");

      return {
        series_key: entry.series_key,
        station_name: entry.station_name,
        sensor_name: entry.sensor_name,
        path,
        points: plottedPoints,
      };
    }),
  };
}

function formatSeriesRange(points: ChartPoint[]) {
  if (points.length === 0) {
    return "n/a";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `${formatValue(min)} -> ${formatValue(max)}`;
}

function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatTooltipTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getDefaultDateFrom() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function getDefaultDateTo() {
  return new Date();
}

function buildPageSummary(totalTimestamps: number, currentPage: number, pageSize: number) {
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(totalTimestamps, currentPage * pageSize);

  return `Showing timestamps ${startIndex}-${endIndex} of ${totalTimestamps}`;
}

function getPopupChartConfig():
  | {
      stationIds: number[];
      sensorIds: number[];
      dateFrom: Date | null;
      dateTo: Date | null;
    }
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get("popup") !== "1") {
    return null;
  }

  return {
    stationIds: searchParams
      .getAll("station_ids")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    sensorIds: searchParams
      .getAll("sensor_ids")
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    dateFrom: toDateFromIso(searchParams.get("date_from")),
    dateTo: toDateFromIso(searchParams.get("date_to")),
  };
}

function toDateFromIso(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
