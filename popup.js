document.getElementById("groupButton").addEventListener("click", async () => {
    const btn = document.getElementById("groupButton");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Grouping...";

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab");

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "groupTab", category: "Other" }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(resp);
                }
            });
        });

        if (response.success) {
            showNotification(`✓ Grouped as "${response.category}"`, 'success');
            btn.textContent = "✓ Grouped!";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } else {
            throw new Error(response.error || "Unknown error");
        }
    } catch (error) {
        showNotification(`✗ ${error.message}`, 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

function showNotification(message, type) {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}
