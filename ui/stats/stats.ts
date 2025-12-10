import { getStats, resetStats } from "../../src/shared/stats";
import type { GroupingStats } from "../../src/shared/types";

/**
 * YouTube Tab Grouper - Statistics Page
 * Displays grouping analytics and usage statistics.
 */

const totalTabsEl = document.getElementById("totalTabs");
const totalCategoriesEl = document.getElementById("totalCategories");
const topCategoryEl = document.getElementById("topCategory");
const topCountEl = document.getElementById("topCount");
const chartContainerEl = document.getElementById("categoryChart");
const resetStatsBtn = document.getElementById("resetStats");
const backBtn = document.getElementById("backBtn");

document.addEventListener("DOMContentLoaded", () => { void loadAndDisplayStats(); });

resetStatsBtn?.addEventListener("click", () => {
  void (async () => {
    if (!confirm("Are you sure you want to reset all statistics?")) return;

    await resetStats();
    await loadAndDisplayStats();
    alert("Statistics reset");
  })();
});

backBtn?.addEventListener("click", () => window.close());

async function loadAndDisplayStats() {
  try {
    const stats = await loadStats();

    if (totalTabsEl) totalTabsEl.textContent = String(stats.totalTabs || 0);
    const categoryCount = Object.keys(stats.categoryCount || {}).length;
    if (totalCategoriesEl) totalCategoriesEl.textContent = String(categoryCount);

    const topEntry = Object.entries(stats.categoryCount || {}).sort(([, a], [, b]) => b - a)[0];

    if (topEntry) {
      if (topCategoryEl) topCategoryEl.textContent = topEntry[0];
      if (topCountEl) topCountEl.textContent = `${topEntry[1]} tabs`;
    } else {
      if (topCategoryEl) topCategoryEl.textContent = "-";
      if (topCountEl) topCountEl.textContent = "0 tabs";
    }

    displayChart(stats.categoryCount || {});
  } catch (error) {
    console.error("Error loading stats:", error);
    alert("Failed to load statistics");
  }
}

async function loadStats() {
    return getStats();
}

function displayChart(categoryCount: GroupingStats["categoryCount"]) {
  if (!chartContainerEl) return;
  if (!categoryCount || typeof categoryCount !== "object" || Object.keys(categoryCount).length === 0) {
    chartContainerEl.innerHTML = '<p style="text-align: center; color: #999;">No data to display</p>';
    return;
  }

  const maxCount = Math.max(...Object.values(categoryCount));
  const chartHTML = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => {
      const percentage = (count / maxCount) * 100;
      return `
                <div class="chart-bar">
                    <div class="bar-label">${category}</div>
                    <div class="bar-container">
                        <div class="bar" style="width: ${percentage}%">
                            <span class="bar-value">${count}</span>
                        </div>
                    </div>
                </div>
            `;
    })
    .join("");

  chartContainerEl.innerHTML = chartHTML;
}
