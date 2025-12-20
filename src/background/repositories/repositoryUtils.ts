import { toError } from "../../shared/utils/errorUtils";

type StorageArea = "sync" | "local";

/**
 * Read from Chrome storage with standardized error handling.
 *
 * @param area - The storage area to read from ("sync" or "local")
 * @param key - The storage key to read
 * @param defaultValue - Default value if key doesn't exist
 * @returns Promise resolving to the stored value or default
 *
 * @example
 * const settings = await readChromeStorage("sync", "mySettings", {});
 */
export async function readChromeStorage<T = unknown>(area: StorageArea, key: string, defaultValue: T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
      storage.get({ [key]: defaultValue }, (result) => {
        if (chrome.runtime.lastError) {
          reject(toError(chrome.runtime.lastError.message, `storage.${area}.get`));
          return;
        }
        resolve((result[key] ?? defaultValue) as T);
      });
    } catch (error) {
      reject(toError(error, `storage.${area}.get`));
    }
  });
}

/**
 * Write to Chrome storage with standardized error handling.
 *
 * @param area - The storage area to write to ("sync" or "local")
 * @param data - The data to write (object with key-value pairs)
 * @returns Promise resolving when write is complete
 *
 * @example
 * await writeChromeStorage("sync", { mySettings: { enabled: true } });
 */
export async function writeChromeStorage(area: StorageArea, data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
      storage.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(toError(chrome.runtime.lastError.message, `storage.${area}.set`));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(toError(error, `storage.${area}.set`));
    }
  });
}

/**
 * Read all data from Chrome storage.
 *
 * @param area - The storage area to read from ("sync" or "local")
 * @returns Promise resolving to all stored data
 *
 * @example
 * const allData = await readAllChromeStorage("sync");
 */
export async function readAllChromeStorage(area: StorageArea): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    try {
      const storage = area === "sync" ? chrome.storage.sync : chrome.storage.local;
      storage.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(toError(chrome.runtime.lastError.message, `storage.${area}.get`));
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      reject(toError(error, `storage.${area}.get`));
    }
  });
}
