import { state } from "./state.js";
import { load, save, exportData, importData, clearAllData, STORAGE_PREFIX } from "../utils/storage.js";
import { showToast, showError, showSuccess } from "../components/toast.js";
import { refreshIcons, focusFirstFocusable } from "../utils/helpers.js";

let els = {};

export function initDataTools(elements) {
  els = elements;
}

export function openDataTools() {
  els.dataToolsModal.innerHTML = renderDataTools();
  els.dataToolsModal.classList.remove("hidden");
  refreshIcons();
  focusFirstFocusable(els.dataToolsModal);
}

export function closeDataTools() {
  els.dataToolsModal.classList.add("hidden");
  els.dataToolsModal.innerHTML = "";
}

export function handleExport() {
  const data = exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ias2-commerce-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess("Data exported successfully.");
}

export function handleImport(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch {
      showError("Import failed: the file is not valid JSON.");
      return;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      showError("Import failed: expected a JSON object with users, items, and orders arrays.");
      return;
    }

    const arrays = ["users", "items", "orders", "cart", "wishlist"];
    const badKey = arrays.find((key) => key in data && !Array.isArray(data[key]));
    if (badKey) {
      showError(`Import failed: "${badKey}" must be a list.`);
      return;
    }

    if (data.theme && data.theme !== "light" && data.theme !== "dark") {
      showError("Import failed: theme must be \"light\" or \"dark\".");
      return;
    }

    if (!arrays.some((key) => key in data) && !data.theme) {
      showError("Import failed: no users, items, orders, cart, wishlist, or theme data found.");
      return;
    }

    importData(data);
    showSuccess("Data imported successfully. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  };
  reader.readAsText(file);
}

export function handleClearAll() {
  if (confirm("This will delete ALL data. Are you sure?")) {
    clearAllData();
    showSuccess("All data cleared. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  }
}

function renderDataTools() {
  return `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="dataToolsTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Data Tools</p>
          <h2 id="dataToolsTitle">Export / Import</h2>
        </div>
        <button class="icon-button" type="button" data-action="close-entity" aria-label="Close data tools">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="data-tools-content">
        <section class="tool-section">
          <h3>Export Data</h3>
          <p>Download a backup of all users, items, orders, cart, wishlist, and settings.</p>
          <button class="primary-button" type="button" data-action="export-data">
            <i data-lucide="download"></i>
            Export JSON
          </button>
        </section>
        
        <section class="tool-section">
          <h3>Import Data</h3>
          <p>Restore from a previously exported JSON file. This will overwrite existing data.</p>
          <div class="field">
            <label for="importFile">Select JSON file</label>
            <input id="importFile" type="file" accept=".json" data-action="import-data" />
          </div>
        </section>
        
        <section class="tool-section danger">
          <h3>Clear All Data</h3>
          <p>Permanently delete all users, items, orders, cart, and wishlist. Cannot be undone.</p>
          <button class="danger-button" type="button" data-action="clear-all-data">
            <i data-lucide="trash-2"></i>
            Clear Everything
          </button>
        </section>
      </div>
    </div>
  `;
}
