import { useEffect, useRef } from "react";
import L from "leaflet";
import { MODE_COLORS } from "@/lib/modes";
import type { Attraction, LatLng, PlanDay, Restaurant } from "@/types/workspace";

interface Props {
  center: LatLng;
  attractions: Attraction[];
  restaurants: Restaurant[];
  day: PlanDay | null;
  excludedIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Markers and route lines share one Leaflet instance so they pan and zoom
 * together. Circle markers avoid the bundler-hostile default icon assets.
 */
export default function MapView({
  center,
  attractions,
  restaurants,
  day,
  excludedIds,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [center.lat, center.lng],
      12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const scheduledIds = new Set(
      (day?.items ?? []).filter((i) => i.kind === "attraction").map((i) => i.refId),
    );
    const positions = new Map<string, LatLng>();
    for (const a of attractions) positions.set(a.id, a.location);
    for (const r of restaurants) positions.set(r.id, r.location);

    for (const attraction of attractions) {
      const scheduled = scheduledIds.has(attraction.id);
      const excluded = excludedIds.includes(attraction.id);
      const selected = selectedId === attraction.id;
      const color = scheduled ? "#1c1c1a" : excluded ? "#a3a3a3" : "#6b7280";

      L.circleMarker([attraction.location.lat, attraction.location.lng], {
        radius: selected ? 10 : scheduled ? 8 : 6,
        color: selected ? "#2563eb" : color,
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: excluded ? 0.35 : 0.85,
      })
        .bindTooltip(attraction.name)
        .on("click", () => onSelect(attraction.id))
        .addTo(layer);
    }

    for (const item of day?.items ?? []) {
      if (item.kind !== "meal") continue;
      const spot = positions.get(item.refId);
      if (!spot) continue;
      L.circleMarker([spot.lat, spot.lng], {
        radius: 7,
        color: "#b45309",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.9,
      })
        .bindTooltip(`${item.meal ?? "meal"} · ${item.startTime}`)
        .on("click", () => onSelect(item.refId))
        .addTo(layer);
    }

    for (const leg of day?.legs ?? []) {
      const from = positions.get(day?.items[leg.fromIndex]?.refId ?? "");
      const to = positions.get(day?.items[leg.toIndex]?.refId ?? "");
      if (!from || !to) continue;
      L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: MODE_COLORS[leg.mode],
          weight: 4,
          opacity: 0.85,
          dashArray: leg.estimated ? "6 6" : undefined,
        },
      )
        .bindTooltip(`${leg.mode} · ${leg.durationMinutes} min`)
        .addTo(layer);
    }
  }, [attractions, restaurants, day, excludedIds, selectedId, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}
