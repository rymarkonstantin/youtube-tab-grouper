let chart = null;

document.addEventListener('DOMContentLoaded', loadStats);

document.getElementById('backBtn').addEventListener('click', () => {
    window.close();
});

document.getElementById('resetStats').addEventListener('click', () => {
    if (confirm('⚠️ Reset all statistics? This cannot be undone.')) {
        chrome.storage.local.set({ groupingStats: {} }, () => {
            location.reload();
        });
    }
});

async function loadStats() {
    const stats = await new Promise(resolve => {
        chrome.storage.local.get('groupingStats', (result) => {
            resolve(result.groupingStats || {
                totalTabs: 0,
                categoryCount: {},
                sessionsToday: 0
            });
        });
    });

    // Update stat cards
    document.getElementById('totalTabs').textContent = stats.totalTabs || 0;
    document.getElementById('totalCategories').textContent = Object.keys(stats.categoryCount).length;

    // Find top category
    if (Object.keys(stats.categoryCount).length > 0) {
        const topCat = Object.entries(stats.categoryCount).sort(([, a], [, b]) => b - a)[0];
        document.getElementById('topCategory').textContent = topCat[0];
        document.getElementById('topCount').textContent = `${topCat[1]} tabs`;
    }

    // Draw chart
    drawChart(stats.categoryCount);
}

function drawChart(categoryCount) {
    const ctx = document.getElementById('categoryChart').getContext('2d');

    if (Object.keys(categoryCount).length === 0) {
        ctx.font = '16px Arial';
        ctx.fillStyle = '#5f6368';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet. Start grouping tabs!', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    if (chart) {
        chart.destroy();
    }

    const colors = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#A142F4', '#24C6EB', '#F538A0', '#9AA0A6'];

    chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCount),
            datasets: [{
                data: Object.values(categoryCount),
                backgroundColor: colors.slice(0, Object.keys(categoryCount).length),
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 14 },
                        padding: 15,
                        color: '#202124'
                    }
                }
            }
        }
    });
}