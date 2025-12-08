import {
    DEFAULT_STATS,
    withStatsDefaults,
    getStats,
    resetStats
} from '../../src/shared/stats.js';

/**
 * YouTube Tab Grouper - Statistics Page
 * Displays grouping analytics and usage statistics.
 */

const totalTabsEl = document.getElementById('totalTabs');
const totalCategoriesEl = document.getElementById('totalCategories');
const topCategoryEl = document.getElementById('topCategory');
const topCountEl = document.getElementById('topCount');
const chartContainerEl = document.getElementById('categoryChart');
const resetStatsBtn = document.getElementById('resetStats');
const backBtn = document.getElementById('backBtn');

document.addEventListener('DOMContentLoaded', loadAndDisplayStats);

resetStatsBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all statistics?')) return;

    await resetStats({
        ...DEFAULT_STATS,
        lastReset: new Date().toDateString()
    });
    await loadAndDisplayStats();
    alert('ƒo. Statistics reset');
});

backBtn.addEventListener('click', () => window.close());

async function loadAndDisplayStats() {
    try {
        const stats = await loadStats();

        totalTabsEl.textContent = stats.totalTabs || 0;
        const categoryCount = Object.keys(stats.categoryCount || {}).length;
        totalCategoriesEl.textContent = categoryCount;

        const topEntry = Object.entries(stats.categoryCount || {})
            .sort(([, a], [, b]) => b - a)[0];

        if (topEntry) {
            topCategoryEl.textContent = topEntry[0];
            topCountEl.textContent = `${topEntry[1]} tabs`;
        } else {
            topCategoryEl.textContent = '-';
            topCountEl.textContent = '0 tabs';
        }

        displayChart(stats.categoryCount || {});
    } catch (error) {
        console.error('Error loading stats:', error);
        alert('ƒ?O Failed to load statistics');
    }
}

async function loadStats() {
    const stats = await getStats(DEFAULT_STATS);
    return withStatsDefaults(stats);
}

function displayChart(categoryCount) {
    if (!categoryCount || typeof categoryCount !== 'object' || Object.keys(categoryCount).length === 0) {
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
        .join('');

    chartContainerEl.innerHTML = chartHTML;
}
