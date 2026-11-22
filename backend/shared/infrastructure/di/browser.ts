import type { SqlJsStatic } from "sql.js";
import type { IDatabaseStorage } from "../persistence/database";
import { buildContainer, type AppContainer } from "./container";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DB_NAME = "finanzas-local-first";
const STORE = "database";
const KEY = "main";

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
    __finanzasContainer?: Promise<AppContainer>;
  }
}

/** Persiste los bytes de SQLite en IndexedDB del navegador. */
class IndexedDbStorage implements IDatabaseStorage {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async load() {
    const data = await this.withStore<Uint8Array | undefined>("readonly", (s) => s.get(KEY));
    return data ?? null;
  }

  async save(bytes: Uint8Array) {
    await this.withStore("readwrite", (s) => s.put(bytes, KEY));
  }
}

/** Carga el motor SQLite/WASM (script clásico servido desde /public: evita problemas de bundling). */
function loadSqlJs(): Promise<SqlJsStatic> {
  return new Promise((resolve, reject) => {
    const boot = () => window.initSqlJs!({ locateFile: (file) => `${BASE_PATH}/sqljs/${file}` }).then(resolve, reject);
    if ("initSqlJs" in window) return void boot();
    const script = document.createElement("script");
    script.src = `${BASE_PATH}/sqljs/sql-wasm-browser.js`;
    script.onload = boot;
    script.onerror = () => reject(new Error("No se pudo cargar el motor SQLite del navegador"));
    document.head.appendChild(script);
  });
}

/** Singleton por pestaña: se crea la primera vez y se reutiliza (incluye hot-reload en dev). */
export function getContainer(): Promise<AppContainer> {
  if (typeof window === "undefined") return new Promise<AppContainer>(() => {}); // prerender estático: nunca resuelve
  window.__finanzasContainer ??= loadSqlJs().then((sqlJs) =>
    buildContainer({ sqlJs, storage: new IndexedDbStorage(), location: "Este navegador (IndexedDB)" }),
  );
  return window.__finanzasContainer;
}
