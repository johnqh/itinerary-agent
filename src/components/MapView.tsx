import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MODE_COLORS } from "@/lib/modes";
import { boundsOf } from "@/lib/bounds";
import type {
  Attraction,
  LatLng,
  PlanDay,
  Restaurant,
  Selection,
} from "@/types/workspace";

interface Props {
  /** Where the map opens. Afterwards it follows the markers themselves. */
  center: LatLng;
  attractions: Attraction[];
  restaurants: Restaurant[];
  day: PlanDay | null;
  excludedIds: string[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  /** Called once when the tile provider stops answering. */
  onTileError: (notice: string) => void;
}

export const TILE_FAILURE_NOTICE =
  "Base map tiles are not loading, so the map is showing positions without its background. Everything else on this page is unaffected.";

/**
 * Markers and route lines share one Leaflet instance so they pan and zoom
 * together. Circle markers avoid the bundler-hostile default icon assets.
 *
 * Tile failures are watched rather than ignored: an unreachable tile provider
 * otherwise leaves a blank rectangle that looks like a bug in this app, and
 * section 4.8 requires every external dependency to state its degraded mode.
 */
export default function MapView({
  center,
  attractions,
  restaurants,
  day,
  excludedIds,
  selection,
  onSelect,
  onTileError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  // Held in a ref so a new callback identity never tears down the map.
  const onTileErrorRef = useRef(onTileError);
  onTileErrorRef.current = onTileError;

  // The opening view only. A later centre arrives as a fit to the markers
  // rather than as a rebuilt map, which would throw away the traveller's zoom.
  const initialCenter = useRef(center).current;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [initialCenter.lat, initialCenter.lng],
      12,
    );
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    });
    // Latched: one failing tile is enough to say the background is unreliable,
    // and a notice that flickered with every pan would be worse than none.
    let reported = false;
    tiles.on("tileerror", () => {
      if (reported) return;
      reported = true;
      setTilesFailed(true);
      onTileErrorRef.current(TILE_FAILURE_NOTICE);
    });
    tiles.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [initialCenter]);

  /**
   * Frames whatever was discovered.
   *
   * Keyed on which places are on the map, not on every render: refitting on a
   * selection or a replan would yank the view out from under someone who had
   * just panned it. A new set of candidates — a live run for another city —
   * is exactly when the view should move.
   */
  const fittedRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = [
      ...attractions.map((a) => a.id),
      ...restaurants.map((r) => r.id),
    ].join("|");
    if (key === fittedRef.current) return;

    const bounds = boundsOf([
      ...attractions.map((a) => a.location),
      ...restaurants.map((r) => r.location),
    ]);
    if (!bounds) return;

    fittedRef.current = key;
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [48, 48], maxZoom: 15 },
    );
  }, [attractions, restaurants]);

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
      const selected =
        selection?.kind === "attraction" && selection.id === attraction.id;
      const color = scheduled ? "#1c1c1a" : excluded ? "#a3a3a3" : "#6b7280";

      L.circleMarker([attraction.location.lat, attraction.location.lng], {
        radius: selected ? 10 : scheduled ? 8 : 6,
        color: selected ? "#2563eb" : color,
        weight: selected ? 3 : 2,
        fillColor: color,
        fillOpacity: excluded ? 0.35 : 0.85,
      })
        .bindTooltip(attraction.name)
        .on("click", () => onSelect({ kind: "attraction", id: attraction.id }))
        .addTo(layer);
    }

    for (const item of day?.items ?? []) {
      if (item.kind !== "meal") continue;
      const spot = positions.get(item.refId);
      if (!spot) continue;
      const selected =
        selection?.kind === "restaurant" && selection.id === item.refId;
      L.circleMarker([spot.lat, spot.lng], {
        radius: selected ? 10 : 7,
        color: selected ? "#2563eb" : "#b45309",
        weight: selected ? 3 : 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.9,
      })
        .bindTooltip(`${item.meal ?? "meal"} · ${item.startTime}`)
        .on("click", () => onSelect({ kind: "restaurant", id: item.refId }))
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
  }, [attractions, restaurants, day, excludedIds, selection, onSelect]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full bg-hairline" />
      {tilesFailed && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] p-2">
          <p className="pointer-events-auto rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow">
            {TILE_FAILURE_NOTICE}
          </p>
        </div>
      )}
    </div>
  );
}
