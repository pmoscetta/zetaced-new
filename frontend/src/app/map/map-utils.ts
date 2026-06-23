export type StationSensor = {
  sensor_id: number | null;
  sensor_type_id: number | null;
  sensor_name: string;
  last_value: number | null;
  last_update: string | null;
};

export type StationSummary = {
  station_id: number;
  station_name: string;
  latitude: number | null;
  longitude: number | null;
  latest_update: string | null;
  sensors: StationSensor[];
};

export function hasValidCoordinates(station: StationSummary) {
  return Number.isFinite(station.latitude) && Number.isFinite(station.longitude);
}

export function getStationCoordinates(station: StationSummary): [number, number] | null {
  if (!hasValidCoordinates(station)) {
    return null;
  }

  return [station.latitude as number, station.longitude as number];
}

export function formatCoordinate(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return value.toFixed(5);
}

export function formatValue(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
