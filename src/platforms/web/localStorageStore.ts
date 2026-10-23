import type { KeyValueStore } from '../../services/storage';

/**
 * Web key-value store on localStorage.
 * Never throws: private browsing, blocked storage or a full quota just mean nothing is kept.
 */
export default class LocalStorageStore implements KeyValueStore {
    get(key: string): string | null {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            console.warn(`Storage read failed for ${key}:`, error);
            return null;
        }
    }

    set(key: string, value: string): void {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            console.warn(`Storage write failed for ${key}:`, error);
        }
    }
}
