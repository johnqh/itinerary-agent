import { useEffect, useRef } from "react";
import L from "leaflet";
import { MODE_COLORS } from "@/lib/modes";
import { categoryStyle, MEAL_STYLE } from "@/lib/categories";
import type {
  Attraction,
  LatLng,
  PlanDay,
  Restaurant,
  Selection,
} from "@/types/workspace";

interface Props {
  center: LatLng;
  attractions: Attraction[];
  restaurants: Restaurant[];
  day: PlanDay | null;
  excludedIds: string[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onTileError?: (notice: string) => void;
}

/**
 * Markers and route lines share one Leaflet instance so they pan and zoom
 * together.
 *
 * Pins carry the glyph and colour of what they are, so a map of a dozen places
 * can be read as temples, parks and viewpoints at a glance rather than as a
 * dozen identical dots. A place not in the current day is drawn faded rather
 * than hidden: knowing what was left out is part of judging a plan.
 */

function pinIcon(glyph: string, color: string, state: "active" | "faded" | "selected"): L.DivIcon {
  const size = state === "selected" ? 40 : state === "faded" ? 22 : 32;
  // Faded pins stay legible but clearly secondary: a place not on today's
  // route is context, not a destination.
  const opacity = state === "faded" ? 0.3 : 1;
  const ring = state === "selected" ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${color};` : "box-shadow:0 1px 4px rgba(0,0,0,.35);";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
      display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.5)}px;
      border:2px solid #fff;opacity:${opacity};${ring}">${glyph}</div>`,
  });
}

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
  const fittedKeyRef = useRef<string>("");
  const tileErrorRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [center.lat, center.lng],
      12,
    );
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    });
    // Latched: a failing tile server fires this for every tile in view.
    tiles.on("tileerror", () => {
      if (tileErrorRef.current) return;
      tileErrorRef.current = true;
      onTileError?.(
        "The map background failed to load. Pins and routes are still correct.",
      );
    });
    tiles.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [center.lat, center.lng, onTileError]);

  /**
   * Frames what the traveller is currently looking at.
   *
   * Once a day is selected, that day is the subject: the map fits its stops
   * rather than the whole city, so switching to Day 2 moves the map to Day 2
   * instead of leaving a wide view with a few pins lit up. Before a plan
   * exists, the candidate set is the subject.
   *
   * Keyed on what is being framed, so a selection, a replan or a re-render
   * never steals a pan the traveller made themselves.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const positions = new Map<string, LatLng>();
    for (const a of attractions) positions.set(a.id, a.location);
    for (const r of restaurants) positions.set(r.id, r.location);

    const dayPoints = (day?.items ?? [])
      .map((item) => positions.get(item.refId))
      .filter((p): p is LatLng => Boolean(p));

    const points = dayPoints.length > 0 ? dayPoints : attractions.map((a) => a.location);
    if (points.length === 0) return;

    const key = day && dayPoints.length > 0
      ? `day:${day.date}:${day.items.map((i) => i.refId).join("|")}`
      : `all:${attractions.map((a) => a.id).join("|")}`;
    if (fittedKeyRef.current === key) return;
    fittedKeyRef.current = key;

    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [56, 56], maxZoom: 15 },
    );
  }, [attractions, restaurants, day]);

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
      const style = categoryStyle(attraction.category);
      const excluded = excludedIds.includes(attraction.id);
      const inDay = scheduledIds.has(attraction.id);
      const selected = selection?.kind === "attraction" && selection.id === attraction.id;
      const state = selected
        ? "selected"
        : day
          ? inDay
            ? "active"
            : "faded"
          : excluded
            ? "faded"
            : "active";

      L.marker([attraction.location.lat, attraction.location.lng], {
        icon: pinIcon(style.glyph, style.color, state),
        zIndexOffset: selected ? 1000 : inDay ? 500 : 0,
      })
        .bindTooltip(`${attraction.name}`, { direction: "top", offset: [0, -18] })
        .on("click", () => onSelect({ kind: "attraction", id: attraction.id }))
        .addTo(layer);
    }

    for (const item of day?.items ?? []) {
      if (item.kind !== "meal") continue;
      const spot = positions.get(item.refId);
      if (!spot) continue;
      const selected = selection?.kind === "restaurant" && selection.id === item.refId;
      L.marker([spot.lat, spot.lng], {
        icon: pinIcon(MEAL_STYLE.glyph, MEAL_STYLE.color, selected ? "selected" : "active"),
        zIndexOffset: selected ? 1000 : 600,
      })
        .bindTooltip(`${item.meal ?? "meal"} · ${item.startTime}`, {
          direction: "top",
          offset: [0, -18],
        })
        .on("click", () => onSelect({ kind: "restaurant", id: item.refId }))
        .addTo(layer);
    }

    for (const leg of day?.legs ?? []) {
      const from = positions.get(day?.items[leg.fromIndex]?.refId ?? "");
      const to = positions.get(day?.items[leg.toIndex]?.refId ?? "");
      if (!from || !to || !day) continue;

      const selected =
        selection?.kind === "leg" &&
        selection.date === day.date &&
        selection.fromIndex === leg.fromIndex;

      const label = leg.transitLines?.length
        ? `${leg.transitLines.join(" → ")} · ${leg.durationMinutes} min`
        : `${leg.mode} · ${leg.durationMinutes} min${leg.estimated ? " (estimated)" : ""}`;

      L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: MODE_COLORS[leg.mode],
          weight: selected ? 8 : 5,
          opacity: selected ? 1 : 0.8,
          // A dashed line means the travel time is modelled, not measured.
          dashArray: leg.estimated ? "6 7" : undefined,
        },
      )
        .bindTooltip(label, { sticky: true })
        .on("click", () => onSelect({ kind: "leg", date: day.date, fromIndex: leg.fromIndex }))
        .addTo(layer);
    }
  }, [attractions, restaurants, day, excludedIds, selection, onSelect]);

  return <div ref={containerRef} className="h-full w-full bg-hairline" />;
}
