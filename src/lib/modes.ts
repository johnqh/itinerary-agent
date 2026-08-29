import type { TransportMode } from "@/types/workspace";

export const MODE_COLORS: Record<TransportMode, string> = {
  walk: "#16a34a",
  transit: "#2563eb",
  rideshare: "#9333ea",
  car: "#ea580c",
};

export const MODE_LABELS: Record<TransportMode, string> = {
  walk: "Walk",
  transit: "Transit",
  rideshare: "Rideshare",
  car: "Car",
};
