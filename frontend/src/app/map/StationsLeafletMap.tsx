"use client";

import { divIcon, latLngBounds } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import {
  formatCoordinate,
  formatDateTime,
  formatValue,
  getStationCoordinates,
  type StationSummary,
} from "./map-utils";

type StationsLeafletMapProps = {
  stations: StationSummary[];
};

const fallbackCenter: [number, number] = [42.5, 12.5];

export default function StationsLeafletMap({ stations }: StationsLeafletMapProps) {
  const [activeStationId, setActiveStationId] = useState<number | null>(null);

  const mappedStations = useMemo(
    () =>
      stations
        .map((station) => {
          const coordinates = getStationCoordinates(station);
          if (!coordinates) {
            return null;
          }

          return {
            ...station,
            coordinates,
          };
        })
        .filter((station): station is StationSummary & { coordinates: [number, number] } => station !== null),
    [stations]
  );

  const initialCenter = mappedStations[0]?.coordinates ?? fallbackCenter;

  if (mappedStations.length === 0) {
    return (
      <div
        style={{
          minHeight: "26rem",
          borderRadius: "1rem",
          border: "1px solid #24324a",
          backgroundColor: "#09111f",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          color: "#cbd5e1",
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        No valid station coordinates were returned for this client, so the map cannot be rendered yet.
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "32rem",
        borderRadius: "1rem",
        overflow: "hidden",
        border: "1px solid #24324a",
      }}
    >
      <MapContainer
        center={initialCenter}
        zoom={7}
        scrollWheelZoom
        style={{
          height: "32rem",
          width: "100%",
          backgroundColor: "#dbeafe",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stations={mappedStations} />
        {mappedStations.map((station) => (
          <Marker
            key={station.station_id}
            position={station.coordinates}
            icon={buildStationIcon(station.station_id === activeStationId)}
            eventHandlers={{
              click: () => setActiveStationId(station.station_id),
              popupclose: () => {
                setActiveStationId((current) =>
                  current === station.station_id ? null : current
                );
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -16]}>
              {station.station_name}
            </Tooltip>
            <Popup minWidth={240} maxWidth={420} className="zetaced-station-popup">
              <div
                style={{
                  display: "grid",
                  gap: "0.7rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.98rem",
                    fontWeight: 700,
                    color: "#111827",
                    lineHeight: 1.2,
                  }}
                >
                  {station.station_name} ({String(station.station_id).padStart(2, "0")})
                </div>

                {station.sensors.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#4b5563",
                    }}
                  >
                    No latest sensor data available.
                  </div>
                ) : (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.15rem",
                      display: "grid",
                      gap: "0.28rem",
                      color: "#111827",
                      fontSize: "0.82rem",
                      lineHeight: 1.35,
                    }}
                  >
                    {station.sensors.map((sensor) => (
                      <li key={`${station.station_id}-${sensor.sensor_id ?? sensor.sensor_name}`}>
                        <span style={{ color: "#374151" }}>
                          {formatDateTime(sensor.last_update)}
                        </span>{" "}
                        <strong>{sensor.sensor_name}</strong>: {formatValue(sensor.last_value)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

type FitBoundsProps = {
  stations: Array<StationSummary & { coordinates: [number, number] }>;
};

function FitBounds({ stations }: FitBoundsProps) {
  const map = useMap();

  useEffect(() => {
    if (stations.length === 0) {
      return;
    }

    if (stations.length === 1) {
      map.setView(stations[0].coordinates, 11);
      return;
    }

    const bounds = latLngBounds(stations.map((station) => station.coordinates));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, stations]);

  return null;
}

function buildStationIcon(isActive: boolean) {
  return divIcon({
    className: "",
    html: `<span class="zetaced-station-marker${isActive ? " zetaced-station-marker--active" : ""}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14],
  });
}
