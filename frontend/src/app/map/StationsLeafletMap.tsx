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
          backgroundColor: "#09111f",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
            <Popup minWidth={280}>
              <div style={{ display: "grid", gap: "0.8rem" }}>
                <div>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {station.station_name}
                  </div>
                  <div
                    style={{
                      marginTop: "0.25rem",
                      fontSize: "0.85rem",
                      color: "#475569",
                    }}
                  >
                    Station #{station.station_id}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.35rem",
                    fontSize: "0.9rem",
                    color: "#1e293b",
                  }}
                >
                  <div>
                    Coordinates: {formatCoordinate(station.latitude)},{" "}
                    {formatCoordinate(station.longitude)}
                  </div>
                  <div>Latest update: {formatDateTime(station.latest_update)}</div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "0.5rem",
                  }}
                >
                  {station.sensors.length === 0 ? (
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: "#475569",
                      }}
                    >
                      No latest sensor data available.
                    </div>
                  ) : (
                    station.sensors.map((sensor) => (
                      <div
                        key={`${station.station_id}-${sensor.sensor_id ?? sensor.sensor_name}`}
                        style={{
                          border: "1px solid #cbd5e1",
                          borderRadius: "0.75rem",
                          padding: "0.65rem 0.75rem",
                          backgroundColor: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#0f172a",
                          }}
                        >
                          {sensor.sensor_name}
                        </div>
                        <div
                          style={{
                            marginTop: "0.2rem",
                            fontSize: "0.9rem",
                            color: "#1e293b",
                          }}
                        >
                          Value: {formatValue(sensor.last_value)}
                        </div>
                        <div
                          style={{
                            marginTop: "0.2rem",
                            fontSize: "0.85rem",
                            color: "#475569",
                          }}
                        >
                          Updated: {formatDateTime(sensor.last_update)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
