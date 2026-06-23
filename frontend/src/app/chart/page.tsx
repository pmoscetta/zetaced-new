"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { APPLY_FILTERS_EVENT, type ChatFilters } from "../AIChatWidget";
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

type CrosshairState = {
  timestamp: string;
  x: number;
};

const DEFAULT_CHART_PAGE_SIZE = 500;
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
  const [pointsPerPageInput, setPointsPerPageInput] = useState(
    String(DEFAULT_CHART_PAGE_SIZE)
  );
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);
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
  const pointsPerPage = parsePositiveInteger(
    pointsPerPageInput,
    DEFAULT_CHART_PAGE_SIZE
  );
  const totalPages = Math.max(1, Math.ceil(allTimestamps.length / pointsPerPage));
  const visibleTimestampKeys = useMemo(() => {
    const startIndex = (currentPage - 1) * pointsPerPage;
    return allTimestamps.slice(startIndex, startIndex + pointsPerPage);
  }, [allTimestamps, currentPage, pointsPerPage]);
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
  const chartGeometry = useMemo(
    () => buildChartGeometry(visibleSeries, visibleTimestampKeys),
    [visibleSeries, visibleTimestampKeys]
  );

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

  const applyChatFiltersRef = useRef<(filters: ChatFilters) => void>(() => {});
  applyChatFiltersRef.current = (filters: ChatFilters) => {
    const nextStationIds =
      filters.station_ids.length > 0 ? filters.station_ids : selectedStationIds;
    const nextSensorIds =
      filters.sensor_ids.length > 0 ? filters.sensor_ids : selectedSensorIds;
    const parsedFrom = filters.date_from ? new Date(filters.date_from) : null;
    const parsedTo = filters.date_to ? new Date(filters.date_to) : null;
    const nextDateFrom =
      parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : dateFrom;
    const nextDateTo =
      parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : dateTo;

    setSelectedStationIds(nextStationIds);
    setSelectedSensorIds(nextSensorIds);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
    setCrosshair(null);

    void loadChart(nextStationIds, nextSensorIds, nextDateFrom, nextDateTo);
  };

  useEffect(() => {
    function handleApplyFilters(event: Event) {
      const custom = event as CustomEvent<ChatFilters>;
      if (custom.detail) {
        applyChatFiltersRef.current(custom.detail);
      }
    }

    window.addEventListener(APPLY_FILTERS_EVENT, handleApplyFilters);
    return () => {
      window.removeEventListener(APPLY_FILTERS_EVENT, handleApplyFilters);
    };
  }, []);

  function goToPreviousPage() {
    setCrosshair(null);
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCrosshair(null);
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  function handlePointsPerPageChange(value: string) {
    setPointsPerPageInput(value);
    setCrosshair(null);
    setCurrentPage(1);
  }

  function handlePlotMouseMove(event: React.MouseEvent<SVGRectElement>) {
    const svgElement = event.currentTarget.ownerSVGElement;
    if (!svgElement || chartGeometry.timestampX.length === 0) {
      return;
    }

    const rect = svgElement.getBoundingClientRect();
    const pointerX =
      ((event.clientX - rect.left) / rect.width) * chartGeometry.width;
    const nearest = chartGeometry.timestampX.reduce((closest, candidate) =>
      Math.abs(candidate.x - pointerX) < Math.abs(closest.x - pointerX)
        ? candidate
        : closest
    );

    setCrosshair({ timestamp: nearest.timestamp, x: nearest.x });
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.75rem",
                justifyContent: "flex-end",
              }}
            >
              {popupMode ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    color: "#cbd5e1",
                    fontSize: "0.9rem",
                  }}
                >
                  <span>Points per page</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pointsPerPageInput}
                    onChange={(event) => handlePointsPerPageChange(event.target.value)}
                    style={{
                      ...inputStyle,
                      width: "7rem",
                      padding: "0.55rem 0.75rem",
                      fontSize: "0.9rem",
                    }}
                  />
                </label>
              ) : null}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                summary={buildPageSummary(allTimestamps.length, currentPage, pointsPerPage)}
                onPrevious={goToPreviousPage}
                onNext={goToNextPage}
              />
            </div>
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
                viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                style={{
                  width: "100%",
                  minWidth: "42rem",
                  height: "24rem",
                  display: "block",
                }}
              >
                <rect
                  x="0"
                  y="0"
                  width={chartGeometry.width}
                  height={chartGeometry.height}
                  fill="#0b1220"
                />
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

                {chartGeometry.xTicks.map((tick) => (
                  <g key={tick.key} pointerEvents="none">
                    <line
                      x1={tick.x}
                      y1={chartGeometry.plotTop}
                      x2={tick.x}
                      y2={chartGeometry.plotBottom}
                      stroke="#16202f"
                      strokeWidth="1"
                    />
                    <text
                      x={tick.x}
                      y={chartGeometry.plotBottom + 16}
                      fill="#94a3b8"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {tick.dateLabel}
                    </text>
                    <text
                      x={tick.x}
                      y={chartGeometry.plotBottom + 30}
                      fill="#94a3b8"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {tick.timeLabel}
                    </text>
                  </g>
                ))}

                {chartGeometry.series.map((series) => (
                  <path
                    key={series.series_key}
                    d={series.path}
                    fill="none"
                    stroke={seriesColors[series.colorIndex % seriesColors.length]}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

                {crosshair ? (
                  <g pointerEvents="none">
                    <line
                      x1={crosshair.x}
                      y1={chartGeometry.plotTop}
                      x2={crosshair.x}
                      y2={chartGeometry.plotBottom}
                      stroke="#64748b"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    {chartGeometry.series.map((series) => {
                      const point = series.pointByTimestamp[crosshair.timestamp];
                      if (!point) {
                        return null;
                      }
                      return (
                        <circle
                          key={series.series_key}
                          cx={point.x}
                          cy={point.y}
                          r="4.5"
                          fill={seriesColors[series.colorIndex % seriesColors.length]}
                          stroke="#f8fafc"
                          strokeWidth="1.5"
                        />
                      );
                    })}
                    <CrosshairTooltip
                      crosshair={crosshair}
                      geometry={chartGeometry}
                    />
                  </g>
                ) : null}

                <rect
                  x={chartGeometry.plotLeft}
                  y={chartGeometry.plotTop}
                  width={chartGeometry.plotRight - chartGeometry.plotLeft}
                  height={chartGeometry.plotBottom - chartGeometry.plotTop}
                  fill="transparent"
                  onMouseMove={handlePlotMouseMove}
                  onMouseLeave={() => setCrosshair(null)}
                />
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

type PlottedPoint = {
  x: number;
  y: number;
  timestamp: string;
  value: number;
};

type GeometrySeries = {
  series_key: string;
  station_name: string;
  sensor_name: string;
  colorIndex: number;
  path: string;
  points: PlottedPoint[];
  pointByTimestamp: Record<string, PlottedPoint>;
};

type ChartGeometry = {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  gridLines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>;
  xTicks: Array<{ key: string; x: number; dateLabel: string; timeLabel: string }>;
  timestampX: Array<{ timestamp: string; x: number }>;
  series: GeometrySeries[];
};

const CHART_WIDTH = 960;
const CHART_HEIGHT = 380;
const PLOT_LEFT = 48;
const PLOT_RIGHT = CHART_WIDTH - 24;
const PLOT_TOP = 20;
const PLOT_BOTTOM = CHART_HEIGHT - 52;

function buildChartGeometry(
  series: ChartSeries[],
  timestamps: string[]
): ChartGeometry {
  const base: ChartGeometry = {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    plotLeft: PLOT_LEFT,
    plotRight: PLOT_RIGHT,
    plotTop: PLOT_TOP,
    plotBottom: PLOT_BOTTOM,
    gridLines: Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const y = PLOT_TOP + ratio * (PLOT_BOTTOM - PLOT_TOP);
      return { key: `grid-${index}`, x1: PLOT_LEFT, y1: y, x2: PLOT_RIGHT, y2: y };
    }),
    xTicks: [],
    timestampX: [],
    series: [],
  };

  if (series.length === 0 || timestamps.length === 0) {
    return base;
  }

  const times = timestamps.map((value) => new Date(value).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const safeTimeRange = Math.max(maxTime - minTime, 1);
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;

  const xScale = (value: string) => {
    if (timestamps.length === 1) {
      return PLOT_LEFT + plotWidth / 2;
    }
    const time = new Date(value).getTime();
    return PLOT_LEFT + ((time - minTime) / safeTimeRange) * plotWidth;
  };

  const timestampX = timestamps.map((timestamp) => ({
    timestamp,
    x: xScale(timestamp),
  }));

  const tickCount = Math.min(6, timestamps.length);
  const xTicks = Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
    const tsIndex = Math.round(ratio * (timestamps.length - 1));
    const timestamp = timestamps[tsIndex];
    const labels = formatAxisTimestamp(timestamp);
    return {
      key: `tick-${index}`,
      x: xScale(timestamp),
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
    };
  });

  const geometrySeries: GeometrySeries[] = series.map((entry, colorIndex) => {
    const values = entry.points.map((point) => point.value);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 0;
    const valueRange = maxValue - minValue;

    const yScale = (value: number) => {
      if (valueRange === 0) {
        return PLOT_TOP + plotHeight / 2;
      }
      return PLOT_BOTTOM - ((value - minValue) / valueRange) * plotHeight;
    };

    const plottedPoints: PlottedPoint[] = entry.points.map((point) => ({
      x: xScale(point.timestamp),
      y: yScale(point.value),
      timestamp: point.timestamp,
      value: point.value,
    }));

    const pointByTimestamp: Record<string, PlottedPoint> = {};
    for (const point of plottedPoints) {
      pointByTimestamp[point.timestamp] = point;
    }

    const path = plottedPoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      )
      .join(" ");

    return {
      series_key: entry.series_key,
      station_name: entry.station_name,
      sensor_name: entry.sensor_name,
      colorIndex,
      path,
      points: plottedPoints,
      pointByTimestamp,
    };
  });

  return {
    ...base,
    xTicks,
    timestampX,
    series: geometrySeries,
  };
}

type CrosshairTooltipProps = {
  crosshair: CrosshairState;
  geometry: ChartGeometry;
};

function CrosshairTooltip({ crosshair, geometry }: CrosshairTooltipProps) {
  const rows = geometry.series
    .map((series) => {
      const point = series.pointByTimestamp[crosshair.timestamp];
      if (!point) {
        return null;
      }
      return {
        key: series.series_key,
        label: `${series.station_name} - ${series.sensor_name}`,
        value: point.value,
        color: seriesColors[series.colorIndex % seriesColors.length],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return null;
  }

  const boxWidth = 232;
  const boxHeight = 30 + rows.length * 16;
  const boxX =
    crosshair.x + boxWidth + 16 > geometry.plotRight
      ? crosshair.x - boxWidth - 12
      : crosshair.x + 12;
  const boxY = geometry.plotTop + 6;
  const textX = boxX + 12;

  return (
    <g pointerEvents="none">
      <rect
        x={boxX}
        y={boxY}
        rx="10"
        ry="10"
        width={boxWidth}
        height={boxHeight}
        fill="#08111d"
        stroke="#334155"
      />
      <text x={textX} y={boxY + 18} fill="#cbd5e1" fontSize="11" fontWeight="700">
        {formatTooltipTimestamp(crosshair.timestamp)}
      </text>
      {rows.map((row, index) => (
        <text
          key={row.key}
          x={textX}
          y={boxY + 36 + index * 16}
          fontSize="11"
        >
          <tspan fill={row.color}>{"\u25CF "}</tspan>
          <tspan fill="#e2e8f0">{row.label}: </tspan>
          <tspan fill="#f8fafc" fontWeight="700">
            {formatValue(row.value)}
          </tspan>
        </text>
      ))}
    </g>
  );
}

function formatAxisTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: value, timeLabel: "" };
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return {
    dateLabel: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
    timeLabel: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
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

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
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
