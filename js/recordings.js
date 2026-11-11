// Speaking recordings in IndexedDB (localStorage can't hold audio).
import { addDaysIso } from "./schedule.js";

const DB_NAME = "french-dashboard";
const STORE = "recordings";
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("date", "date");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    let result;
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export const putRecording = (rec) => run("readwrite", (s) => s.put(rec));
export const getRecording = (id) => run("readonly", (s) => s.get(id));
export const listRecordingsByDate = (date) => run("readonly", (s) => s.index("date").getAll(date));
export const listAllRecordings = () => run("readonly", (s) => s.getAll());
export const deleteRecording = (id) => run("readwrite", (s) => s.delete(id));
export const clearRecordings = () => run("readwrite", (s) => s.clear());

export async function setStarred(id, starred) {
  const rec = await getRecording(id);
  if (!rec) return;
  rec.starred = starred;
  await putRecording(rec);
}

/** Pure: which recordings fall outside the keep window (starred ones are always kept). */
export function recordingsToPrune(recs, keepDays, todayIso) {
  const cutoff = addDaysIso(todayIso, -keepDays);
  return recs.filter((r) => !r.starred && r.date < cutoff);
}

export async function pruneRecordings(keepDays, todayIso) {
  const doomed = recordingsToPrune(await listAllRecordings(), keepDays, todayIso);
  for (const r of doomed) await deleteRecording(r.id);
  return doomed.length;
}

// ---- backup helpers ----

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

export async function exportRecordings() {
  const all = await listAllRecordings();
  return Promise.all(
    all.map(async ({ blob, ...meta }) => ({ ...meta, dataUrl: await blobToDataUrl(blob) })),
  );
}

export async function importRecordings(list) {
  await clearRecordings();
  for (const { dataUrl, ...meta } of list) {
    if (!dataUrl || !meta.id) continue;
    await putRecording({ ...meta, blob: await dataUrlToBlob(dataUrl) });
  }
}
