export const AVAILABLE_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan"
] as const;

export type GroupColor = (typeof AVAILABLE_COLORS)[number];

export const COLOR_HEX: Record<GroupColor, string> = {
  grey: "#9aa0a6",
  blue: "#4285F4",
  red: "#ea4335",
  yellow: "#fbbc04",
  green: "#34a853",
  pink: "#f538a0",
  purple: "#a142f4",
  cyan: "#24c6eb"
};

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === "string" && (AVAILABLE_COLORS as readonly string[]).includes(value);
}

export function getColorHex(color: unknown): string | undefined {
  return isGroupColor(color) ? COLOR_HEX[color] : undefined;
}
