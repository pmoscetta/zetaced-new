"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type ChartRow = {
  timestamp: string;
  [seriesKey: string]: string | number | null;
};

const DEFAULT_CHART_PAGE_SIZE = 2000;
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
  const [brushStartIndex, setBrushStartIndex] = useState(0);
  const [brushEndIndex, setBrushEndIndex] = useState(0);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<string[]>([]);
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

    void loadPage();
  }, []);

  const allSeries = useMemo(() => results?.series ?? [], [results]);
  const seriesColorMap = useMemo(() => {
    return Object.fromEntries(
      allSeries.map((series, index) => [
        series.series_key,
        seriesColors[index % seriesColors.length],
      ])
    ) as Record<string, string>;
  }, [allSeries]);
  const activeSeries = useMemo(
    () => allSeries.filter((series) => !hiddenSeriesKeys.includes(series.series_key)),
    [allSeries, hiddenSeriesKeys]
  );
  const activeTimestamps = useMemo(() => {
    const uniqueTimestamps = new Set<string>();
    for (const series of activeSeries) {
      for (const point of series.points) {
        uniqueTimestamps.add(point.timestamp);
      }
    }

    return Array.from(uniqueTimestamps).sort(
      (left, right) => new Date(left).getTime() - new Date(right).getTime()
    );
  }, [activeSeries]);
  const pointsPerPage = DEFAULT_CHART_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(activeTimestamps.length / pointsPerPage));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const pageLength = Math.min(pointsPerPage, activeTimestamps.length);
    setBrushStartIndex(0);
    setBrushEndIndex(Math.max(0, pageLength - 1));
  }, [activeTimestamps.length, currentPage, pointsPerPage]);

  const visibleTimestampKeys = useMemo(() => {
    const startIndex = (currentPage - 1) * pointsPerPage;
    return activeTimestamps.slice(startIndex, startIndex + pointsPerPage);
  }, [activeTimestamps, currentPage, pointsPerPage]);
  const visibleTimestampSet = useMemo(
    () => new Set(visibleTimestampKeys),
    [visibleTimestampKeys]
  );
  const pagedSeries = useMemo(() => {
    return activeSeries
      .map((series) => ({
        ...series,
        points: series.points.filter((point) => visibleTimestampSet.has(point.timestamp)),
      }))
      .filter((series) => series.points.length > 0);
  }, [activeSeries, visibleTimestampSet]);
  const chartRows = useMemo(
    () => buildChartRows(visibleTimestampKeys, pagedSeries),
    [visibleTimestampKeys, pagedSeries]
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
      setHiddenSeriesKeys([]);
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
      setHiddenSeriesKeys([]);
      setCurrentPage(1);
      setError("");
    } catch (caughtError) {
      setResults(null);
      setHiddenSeriesKeys([]);
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
    setCurrentPage((page) => Math.max(1, page - 1));
  }

  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  function handleBrushChange(range: { startIndex?: number; endIndex?: number }) {
    if (range.startIndex !== undefined) setBrushStartIndex(range.startIndex);
    if (range.endIndex !== undefined) setBrushEndIndex(range.endIndex);
  }

  function zoomIn() {
    const span = brushEndIndex - brushStartIndex;
    const newSpan = Math.max(9, Math.floor(span / 2));
    const mid = Math.floor((brushStartIndex + brushEndIndex) / 2);
    const newStart = Math.max(0, mid - Math.floor(newSpan / 2));
    const newEnd = Math.min(chartRows.length - 1, newStart + newSpan);
    setBrushStartIndex(newStart);
    setBrushEndIndex(newEnd);
  }

  function zoomOut() {
    const span = brushEndIndex - brushStartIndex;
    const newSpan = Math.min(chartRows.length - 1, span * 2);
    const mid = Math.floor((brushStartIndex + brushEndIndex) / 2);
    const newStart = Math.max(0, mid - Math.floor(newSpan / 2));
    const newEnd = Math.min(chartRows.length - 1, newStart + newSpan);
    setBrushStartIndex(newStart);
    setBrushEndIndex(newEnd);
  }

  function zoomReset() {
    setBrushStartIndex(0);
    setBrushEndIndex(Math.max(0, chartRows.length - 1));
  }

  function toggleSeries(seriesKey: string) {
    setCurrentPage(1);
    setHiddenSeriesKeys((current) =>
      current.includes(seriesKey)
        ? current.filter((entry) => entry !== seriesKey)
        : [...current, seriesKey]
    );
  }

  const hasSeries = allSeries.length > 0;
  const hasEnabledSeries = activeSeries.length > 0;
  const hasPagedPoints = pagedSeries.length > 0 && chartRows.length > 0;

  return (
    <AppShell
      title={popupMode ? "Chart Window" : "Charts"}
      description={
        popupMode
          ? "This popup charts the current selection opened from DATA. You can open multiple chart windows to compare different selections."
          : "This screen consumes the protected `/api/chart` endpoint and now renders the chart with Recharts for responsive multi-series exploration."
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
                Current result: {allSeries.length} series, {activeTimestamps.length} timestamps
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
            : "Each line is now rendered by Recharts and each sensor card below can enable or disable the plotted curve in real time."
        }
        actions={
          hasEnabledSeries ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.65rem",
                justifyContent: "flex-end",
              }}
            >
              <ZoomButton onClick={zoomIn} label="Zoom in +" />
              <ZoomButton onClick={zoomOut} label="Zoom out −" />
              <ZoomButton onClick={zoomReset} label="Reset" />
              {totalPages > 1 ? (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  summary={buildPageSummary(activeTimestamps.length, currentPage, pointsPerPage)}
                  onPrevious={goToPreviousPage}
                  onNext={goToNextPage}
                />
              ) : null}
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
        ) : !hasSeries ? (
          <StateBox text="No chart points were returned for the current filter set." />
        ) : !hasEnabledSeries ? (
          <StateBox text="All sensor series are disabled. Re-enable at least one checkbox below to plot the chart again." />
        ) : !hasPagedPoints ? (
          <StateBox text="No chart points fall inside the current page window." />
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
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "24rem",
                  minWidth: 0,
                }}
              >
                <ResponsiveContainer width="100%" height="100%" debounce={150}>
                  <LineChart
                    data={chartRows}
                    margin={{ top: 12, right: 24, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid stroke="#1f2b3f" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatAxisTick}
                      minTickGap={28}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      stroke="#334155"
                    />
                    {pagedSeries.map((series) => (
                      <YAxis
                        key={series.series_key}
                        yAxisId={series.series_key}
                        hide
                        domain={buildSeriesDomain(series.points)}
                      />
                    ))}
                    <RechartsTooltip
                      content={<ChartTooltip />}
                      cursor={{ stroke: "#64748b", strokeDasharray: "4 4" }}
                    />
                    {pagedSeries.map((series) => (
                      <Line
                        key={series.series_key}
                        yAxisId={series.series_key}
                        dataKey={series.series_key}
                        name={`${series.station_name} - ${series.sensor_name}`}
                        type="monotone"
                        stroke={seriesColorMap[series.series_key] ?? seriesColors[0]}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                        connectNulls={true}
                      />
                    ))}
                    <Brush
                      dataKey="timestamp"
                      height={28}
                      stroke="#334155"
                      fill="#0b1220"
                      travellerWidth={8}
                      startIndex={brushStartIndex}
                      endIndex={brushEndIndex}
                      onChange={handleBrushChange}
                      tickFormatter={formatAxisTick}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
              }}
            >
              {allSeries.map((series) => {
                const isEnabled = !hiddenSeriesKeys.includes(series.series_key);
                const visibleSeriesEntry = pagedSeries.find(
                  (entry) => entry.series_key === series.series_key
                );
                const seriesColor = seriesColorMap[series.series_key] ?? seriesColors[0];

                return (
                  <label
                    key={series.series_key}
                    style={{
                      backgroundColor: isEnabled ? "#111c30" : "#0b1220",
                      border: `1px solid ${isEnabled ? "#24324a" : "#1f2b3f"}`,
                      borderRadius: "0.85rem",
                      padding: "1rem",
                      display: "grid",
                      gap: "0.6rem",
                      cursor: "pointer",
                      opacity: isEnabled ? 1 : 0.7,
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.65rem",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: "0.9rem",
                            height: "0.9rem",
                            borderRadius: "999px",
                            backgroundColor: seriesColor,
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <strong
                            style={{
                              display: "block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {series.station_name}
                          </strong>
                          <div
                            style={{
                              color: "#cbd5e1",
                              marginTop: "0.15rem",
                            }}
                          >
                            {series.sensor_name}
                          </div>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleSeries(series.series_key)}
                        style={{
                          width: "1rem",
                          height: "1rem",
                          accentColor: "#0ea5e9",
                          flexShrink: 0,
                        }}
                      />
                    </div>

                    <div style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                      Points on page: {visibleSeriesEntry?.points.length ?? 0}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                      Range on page: {formatSeriesRange(visibleSeriesEntry?.points ?? [])}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.82rem" }}>
                      {isEnabled ? "Visible on chart" : "Hidden from chart"}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </PageSection>
    </AppShell>
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

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    name?: string;
    value?: number | string | null;
    color?: string;
  }>;
};

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "#08111d",
        border: "1px solid #334155",
        borderRadius: "0.8rem",
        padding: "0.75rem 0.85rem",
        color: "#e2e8f0",
        minWidth: "14rem",
        boxShadow: "0 12px 28px rgba(2, 6, 23, 0.35)",
      }}
    >
      <div
        style={{
          color: "#cbd5e1",
          fontSize: "0.82rem",
          fontWeight: 700,
          marginBottom: "0.45rem",
        }}
      >
        {formatTooltipTimestamp(label ?? "")}
      </div>
      <div
        style={{
          display: "grid",
          gap: "0.28rem",
        }}
      >
        {payload.map((entry) => (
          <div
            key={String(entry.name)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              fontSize: "0.82rem",
            }}
          >
            <span
              style={{
                width: "0.7rem",
                height: "0.7rem",
                borderRadius: "999px",
                backgroundColor: entry.color ?? "#38bdf8",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#cbd5e1", flex: 1 }}>{entry.name}</span>
            <strong style={{ color: "#f8fafc" }}>
              {typeof entry.value === "number" ? formatValue(entry.value) : entry.value}
            </strong>
          </div>
        ))}
      </div>
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

function ZoomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: "#162235",
        color: "#cbd5e1",
        border: "1px solid #334155",
        borderRadius: "0.6rem",
        padding: "0.55rem 0.85rem",
        fontSize: "0.85rem",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function buildChartRows(timestamps: string[], series: ChartSeries[]): ChartRow[] {
  return timestamps.map((timestamp) => {
    const row: ChartRow = { timestamp };

    for (const entry of series) {
      const point = entry.points.find((candidate) => candidate.timestamp === timestamp);
      row[entry.series_key] = point ? point.value : null;
    }

    return row;
  });
}

function buildSeriesDomain(points: ChartPoint[]): [number, number] {
  if (points.length === 0) {
    return [0, 1];
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (minValue === maxValue) {
    const padding = Math.abs(minValue) * 0.05 || 1;
    return [minValue - padding, maxValue + padding];
  }

  const padding = (maxValue - minValue) * 0.08;
  return [minValue - padding, maxValue + padding];
}

function formatAxisTick(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
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
  if (totalTimestamps === 0) {
    return "No timestamps";
  }

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
