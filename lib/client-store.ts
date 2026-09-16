import type { Database, MediaFile, Project, Submission } from "./types";

const DB_NAME = "asd-2026";
const DB_VERSION = 1;

export const defaultProjects: Project[] = [
  {
    id: "0916",
    slug: "0916",
    createdAt: "2026-09-16T00:00:00.000Z",
  },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txGet<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function txPut(store: IDBObjectStore, value: unknown, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocal(): Promise<Database> {
  try {
    const db = await openDb();
    const store = db.transaction("kv", "readonly").objectStore("kv");
    const projects = (await txGet<Project[]>(store, "projects")) ?? defaultProjects;
    const submissions = (await txGet<Submission[]>(store, "submissions")) ?? [];
    return {
      projects: projects.length ? projects : defaultProjects,
      submissions,
    };
  } catch {
    return { projects: defaultProjects, submissions: [] };
  }
}

export async function saveLocal(data: Database) {
  const db = await openDb();
  const store = db.transaction("kv", "readwrite").objectStore("kv");
  await txPut(store, data.projects, "projects");
  await txPut(store, data.submissions, "submissions");
}

export async function rememberFile(id: string, file: Blob) {
  const db = await openDb();
  const store = db.transaction("files", "readwrite").objectStore("files");
  await txPut(store, file, id);
}

export async function localFileUrl(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    const store = db.transaction("files", "readonly").objectStore("files");
    const file = await txGet<Blob>(store, id);
    return file ? URL.createObjectURL(file) : null;
  } catch {
    return null;
  }
}

export async function persistFiles(files: File[]): Promise<MediaFile[]> {
  const saved: MediaFile[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    await rememberFile(id, file);
    saved.push({
      id,
      url: `idb:${id}`,
      name: file.name,
      mime: file.type || "application/octet-stream",
    });
  }
  return saved;
}

export function mergeProjects(local: Project[], remote: Project[]) {
  const map = new Map<string, Project>();
  for (const item of [...local, ...remote]) map.set(item.id, item);
  if (!map.has("0916")) map.set("0916", defaultProjects[0]);
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function mergeSubmissions(local: Submission[], remote: Submission[]) {
  const map = new Map<string, Submission>();
  for (const item of [...local, ...remote]) {
    const current = map.get(item.id);
    if (!current || item.createdAt >= current.createdAt) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
