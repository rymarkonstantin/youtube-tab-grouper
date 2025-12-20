import { AVAILABLE_COLORS, isGroupColor } from "../../shared/domain/colors";
import { chromeApiClient as defaultApiClient } from "../infra/chromeApiClient";

type Cache = Record<string, string>;

interface ColorAssignerOptions {
  apiClient?: typeof defaultApiClient;
  cache?: Cache;
  defaultColors?: readonly string[];
}

function pickRandomColor(colors: string[] = []) {
  if (!colors.length) return "";
  const idx = Math.floor(Math.random() * colors.length);
  return colors[idx] || "";
}

export class ColorAssigner {
  private apiClient: typeof defaultApiClient;
  private cache: Cache;
  private locks = new Map<string, Promise<void>>();
  private defaultColors: readonly string[];

  constructor(options: ColorAssignerOptions = {}) {
    this.apiClient = options.apiClient ?? defaultApiClient;
    this.cache = this.normalizeCache(options.cache ?? {});
    const defaults = (options.defaultColors ?? AVAILABLE_COLORS).filter(isGroupColor);
    this.defaultColors = defaults.length > 0 ? defaults : AVAILABLE_COLORS;
  }

  /**
   * Assign a color for a category, inspecting neighbor groups and caching results.
   */
  async assignColor(category: string, tabId: number, windowId: number, enabledColors: string[] = []): Promise<string> {
    return this.runExclusive(category, async () => {
      if (this.cache[category]) {
        return this.cache[category];
      }

      const palette = this.resolvePalette(enabledColors);
      const neighborColors = await this.getNeighborColors(tabId, windowId);
      const available = palette.filter((color) => !neighborColors.has(color));
      const color = available.length > 0 ? pickRandomColor(available) : pickRandomColor(palette);

      this.cache[category] = color;
      return color;
    });
  }

  getCache(): Cache {
    return this.cache;
  }

  setCache(cache: Cache) {
    this.cache = this.normalizeCache(cache);
  }

  private async getNeighborColors(tabId: number, windowId: number): Promise<Set<string>> {
    const tabs = await this.apiClient.queryTabs({ windowId });
    const groupIds = [
      ...new Set(
        tabs
          .filter((t) => t.id !== tabId && (t.groupId ?? -1) >= 0)
          .map((t) => t.groupId)
          .filter((gid): gid is number => typeof gid === "number")
      )
    ];

    if (groupIds.length === 0) return new Set();

    const groups = await Promise.all(groupIds.map((gid) => this.apiClient.getTabGroup(gid)));
    return new Set(groups.map((g) => g?.color).filter(isGroupColor));
  }

  private resolvePalette(enabledColors: string[]): string[] {
    if (Array.isArray(enabledColors)) {
      const filtered = enabledColors.filter(isGroupColor);
      if (filtered.length > 0) return filtered;
    }
    return [...this.defaultColors];
  }

  private normalizeCache(cache: Cache): Cache {
    return Object.fromEntries(Object.entries(cache).filter(([, color]) => isGroupColor(color)));
  }

  private async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      previous.then(() => current)
    );

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    }
  }
}

export const colorAssigner = new ColorAssigner({ cache: {} });
