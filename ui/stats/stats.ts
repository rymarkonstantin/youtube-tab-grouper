import type { StatsSnapshot } from "../../src/shared/stats.js";
import { getStats, resetStats } from "../../src/shared/stats.js";
import { type StatsViewModel, buildStatsViewModel } from "./viewModel.js";

/**
 * YouTube Tab Grouper - Statistics Page
 * Displays grouping analytics and usage statistics.
 */

export interface StatsElements {
  totalTabsEl: HTMLElement | null;
  totalCategoriesEl: HTMLElement | null;
  topCategoryEl: HTMLElement | null;
  topCountEl: HTMLElement | null;
  chartContainerEl: HTMLElement | null;
  resetStatsBtn: HTMLElement | null;
  backBtn: HTMLElement | null;
}

const getStatsElements = (root: Document = document): StatsElements => ({
  totalTabsEl: root.getElementById("totalTabs"),
  totalCategoriesEl: root.getElementById("totalCategories"),
  topCategoryEl: root.getElementById("topCategory"),
  topCountEl: root.getElementById("topCount"),
  chartContainerEl: root.getElementById("categoryChart"),
  resetStatsBtn: root.getElementById("resetStats"),
  backBtn: root.getElementById("backBtn")
});

const { vitest: isTestEnv } = import.meta as ImportMeta & { vitest?: boolean };
const isBrowser = typeof document !== "undefined";

if (isBrowser && !isTestEnv) {
  document.addEventListener("DOMContentLoaded", () => {
    void initializeStatsPage();
  });
}

export async function initializeStatsPage(): Promise<void> {
  const elements = getStatsElements();
  attachHandlers(elements);
  await loadAndDisplayStats(elements);
}

function attachHandlers(elements: StatsElements) {
  elements.resetStatsBtn?.addEventListener("click", () => {
    void handleReset(elements);
  });

  elements.backBtn?.addEventListener("click", () => window.close());
}

async function handleReset(elements: StatsElements): Promise<void> {
  if (!confirm("Are you sure you want to reset all statistics?")) return;

  await resetStats();
  await loadAndDisplayStats(elements);
  alert("Statistics reset");
}

export async function loadAndDisplayStats(elements: StatsElements): Promise<void> {
  try {
    const stats = await loadStats();
    const viewModel = buildStatsViewModel(stats);
    renderStatsPage(viewModel, elements);
  } catch (error) {
    console.error("Error loading stats:", error);
    alert("Failed to load statistics");
  }
}

async function loadStats(): Promise<StatsSnapshot> {
  return getStats();
}

export function renderStatsPage(viewModel: StatsViewModel, elements: StatsElements): void {
  if (elements.totalTabsEl) elements.totalTabsEl.textContent = String(viewModel.totalTabs);
  if (elements.totalCategoriesEl) elements.totalCategoriesEl.textContent = String(viewModel.totalCategories);
  if (elements.topCategoryEl)
    elements.topCategoryEl.textContent = viewModel.hasCategoryData ? viewModel.topCategory : "-";
  if (elements.topCountEl) elements.topCountEl.textContent = `${viewModel.topCategoryCount} tabs`;

  renderCategoryChart(viewModel, elements.chartContainerEl);
}

export function renderCategoryChart(viewModel: StatsViewModel, container: HTMLElement | null): void {
  if (!container) return;
  if (!viewModel.hasCategoryData) {
    container.innerHTML = '<p style="text-align: center; color: #999;">No data to display</p>';
    return;
  }

  const chartHTML = viewModel.categoryBreakdown
    .map(
      ({ category, count, percentage }) => `
        <div class="chart-bar">
            <div class="bar-label">${category}</div>
            <div class="bar-container">
                <div class="bar" style="width: ${percentage}%">
                    <span class="bar-value">${count}</span>
                </div>
            </div>
        </div>
    `
    )
    .join("");

  container.innerHTML = chartHTML;
}

export { getStatsElements };
