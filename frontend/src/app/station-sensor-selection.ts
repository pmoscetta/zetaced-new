export type StationSensorOption = {
  sensor_type_id: number;
  sensor_name: string;
};

export type StationWithSensors = {
  station_id: number;
  station_name: string;
  sensors: StationSensorOption[];
};

export type StationSensorSelectionMap = Record<number, number[]>;

export function normalizeStationsWithSensors(
  stations: StationWithSensors[]
): StationWithSensors[] {
  return stations.map((station) => ({
    ...station,
    sensors: dedupeSensors(station.sensors),
  }));
}

export function syncSelectionsForStations(
  stations: StationWithSensors[],
  selectedStationIds: number[],
  currentSelections: StationSensorSelectionMap,
  fallbackSensorIds: number[] = []
): StationSensorSelectionMap {
  const stationMap = new Map(stations.map((station) => [station.station_id, station]));
  const nextSelections: StationSensorSelectionMap = {};

  for (const stationId of dedupeNumbers(selectedStationIds)) {
    const station = stationMap.get(stationId);
    if (!station) {
      continue;
    }

    const availableSensorIds = station.sensors.map((sensor) => sensor.sensor_type_id);
    if (Object.prototype.hasOwnProperty.call(currentSelections, stationId)) {
      nextSelections[stationId] = filterAllowed(
        currentSelections[stationId] ?? [],
        availableSensorIds
      );
      continue;
    }

    const fallbackSelection = filterAllowed(fallbackSensorIds, availableSensorIds);
    nextSelections[stationId] =
      fallbackSelection.length > 0
        ? fallbackSelection
        : availableSensorIds.slice(0, Math.min(3, availableSensorIds.length));
  }

  return nextSelections;
}

export function buildSelectionsFromLegacyFilters(
  stations: StationWithSensors[],
  stationIds: number[],
  sensorIds: number[]
): StationSensorSelectionMap {
  const stationMap = new Map(stations.map((station) => [station.station_id, station]));
  const selections: StationSensorSelectionMap = {};

  for (const stationId of dedupeNumbers(stationIds)) {
    const station = stationMap.get(stationId);
    if (!station) {
      continue;
    }

    const availableSensorIds = station.sensors.map((sensor) => sensor.sensor_type_id);
    selections[stationId] = filterAllowed(sensorIds, availableSensorIds);
  }

  return selections;
}

export function buildSelectionsFromPairStrings(
  stations: StationWithSensors[],
  pairStrings: string[]
): StationSensorSelectionMap {
  const stationMap = new Map(stations.map((station) => [station.station_id, station]));
  const selections: StationSensorSelectionMap = {};

  for (const pairString of pairStrings) {
    const [stationId, sensorTypeId] = parseStationSensorPair(pairString);
    if (stationId === null || sensorTypeId === null) {
      continue;
    }

    const station = stationMap.get(stationId);
    if (!station) {
      continue;
    }

    const isAllowed = station.sensors.some(
      (sensor) => sensor.sensor_type_id === sensorTypeId
    );
    if (!isAllowed) {
      continue;
    }

    const current = selections[stationId] ?? [];
    if (!current.includes(sensorTypeId)) {
      selections[stationId] = [...current, sensorTypeId];
    }
  }

  return selections;
}

export function getSelectedStationIds(
  selections: StationSensorSelectionMap
): number[] {
  return Object.keys(selections)
    .map((stationId) => Number(stationId))
    .filter((stationId) => Number.isFinite(stationId))
    .sort((left, right) => left - right);
}

export function getSelectedSensorIds(
  selections: StationSensorSelectionMap
): number[] {
  return dedupeNumbers(
    Object.values(selections).flatMap((sensorIds) => sensorIds ?? [])
  );
}

export function getSelectedPairStrings(
  selections: StationSensorSelectionMap
): string[] {
  const pairs: string[] = [];

  for (const stationId of getSelectedStationIds(selections)) {
    const sensorIds = dedupeNumbers(selections[stationId] ?? []);
    for (const sensorTypeId of sensorIds) {
      pairs.push(`${stationId}:${sensorTypeId}`);
    }
  }

  return pairs;
}

export function hasSelectedPairs(selections: StationSensorSelectionMap) {
  return getSelectedPairStrings(selections).length > 0;
}

export function appendStationSensorParams(
  params: URLSearchParams,
  selections: StationSensorSelectionMap
) {
  for (const stationId of getSelectedStationIds(selections)) {
    params.append("station_ids", String(stationId));
  }

  for (const sensorTypeId of getSelectedSensorIds(selections)) {
    params.append("sensor_ids", String(sensorTypeId));
  }

  for (const pairString of getSelectedPairStrings(selections)) {
    params.append("station_sensor_pairs", pairString);
  }
}

function dedupeSensors(sensors: StationSensorOption[]): StationSensorOption[] {
  const sensorMap = new Map<number, StationSensorOption>();

  for (const sensor of sensors) {
    if (!sensorMap.has(sensor.sensor_type_id)) {
      sensorMap.set(sensor.sensor_type_id, sensor);
    }
  }

  return Array.from(sensorMap.values()).sort((left, right) =>
    left.sensor_name.localeCompare(right.sensor_name, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

function filterAllowed(values: number[], allowedValues: number[]) {
  const allowedSet = new Set(allowedValues);
  return dedupeNumbers(values).filter((value) => allowedSet.has(value));
}

function dedupeNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isFinite(value)))
  ).sort((left, right) => left - right);
}

function parseStationSensorPair(
  rawValue: string
): [number | null, number | null] {
  const [rawStationId, rawSensorTypeId] = rawValue.split(":");
  const stationId = Number(rawStationId);
  const sensorTypeId = Number(rawSensorTypeId);

  return [
    Number.isFinite(stationId) ? stationId : null,
    Number.isFinite(sensorTypeId) ? sensorTypeId : null,
  ];
}
