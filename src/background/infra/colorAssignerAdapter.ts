import { colorAssigner } from "../services/colorAssigner";
import type { ColorAssignerPort } from "../ports/tabGrouping";

export class ColorAssignerAdapter implements ColorAssignerPort {
  constructor(private readonly assigner = colorAssigner) {}

  assignColor(category: string, tabId: number, windowId: number, enabledColors?: string[]) {
    return this.assigner.assignColor(category, tabId, windowId, enabledColors);
  }

  setCache(cache: Record<string, string>) {
    this.assigner.setCache(cache);
  }
}

export const colorAssignerAdapter = new ColorAssignerAdapter();
