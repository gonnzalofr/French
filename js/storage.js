// Versioned progress store on top of localStorage (or any getItem/setItem backend).
// Pure helpers (emptyState, migrate, parseBackup) are unit-tested in Node.

export const STORAGE_KEY = "french-dashboard";
export const SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = "french-daily";

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    days: {},
    grammar: { currentIndex: 0, log: [] },
    mistakes: [],
    settings: { chime: true, keepRecordingsDays: 14, lastBackup: null, voice: null },
  };
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Bring any saved shape up to the current schema. Throws on data from a newer app version. */
export function migrate(raw) {
  if (!isObject(raw)) return emptyState();
  const version = raw.schemaVersion ?? 1;
  if (typeof version !== "number" || version > SCHEMA_VERSION) {
    throw new Error(`saved data has schemaVersion ${version}, this app understands ${SCHEMA_VERSION}`);
  }
  // Future migrations go here: if (version < 2) raw = v1ToV2(raw); …
  const base = emptyState();
  const grammar = isObject(raw.grammar) ? raw.grammar : {};
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    days: isObject(raw.days) ? raw.days : {},
    grammar: {
      currentIndex: Number.isInteger(grammar.currentIndex) && grammar.currentIndex >= 0 ? grammar.currentIndex : 0,
      log: Array.isArray(grammar.log) ? grammar.log : [],
    },
    mistakes: Array.isArray(raw.mistakes) ? raw.mistakes : [],
    settings: { ...base.settings, ...(isObject(raw.settings) ? raw.settings : {}) },
  };
}

/**
 * @param {{getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void}} backend
 */
export function createStore(backend) {
  let state = emptyState();
  let warning = null;
  const listeners = new Set();

  return {
    get state() {
      return state;
    },
    /** A message to show the user if loading or saving went wrong, else null. */
    get warning() {
      return warning;
    },
    load() {
      let text;
      try {
        text = backend.getItem(STORAGE_KEY);
      } catch {
        warning = "Browser storage is blocked here, so nothing will be saved.";
        state = emptyState();
        return state;
      }
      if (text == null) {
        state = emptyState();
        return state;
      }
      try {
        state = migrate(JSON.parse(text));
      } catch (err) {
        const keptAs = `${STORAGE_KEY}.unreadable-${Date.now()}`;
        try {
          backend.setItem(keptAs, text);
        } catch {
          /* best effort */
        }
        warning = `Saved progress couldn’t be read (${err.message}). The app started fresh; the old data is kept in localStorage under "${keptAs}".`;
        state = emptyState();
      }
      return state;
    },
    save() {
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify(state));
        listeners.forEach((fn) => fn(state));
        return true;
      } catch (err) {
        warning = `Couldn’t save progress: ${err.message}`;
        return false;
      }
    },
    /** Replace everything (used by backup import). */
    replace(next) {
      state = migrate(next);
      return this.save();
    },
    clear() {
      state = emptyState();
      try {
        backend.removeItem?.(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Build the JSON written to a backup file. */
export function makeBackup(state, recordings = [], now = new Date()) {
  return {
    app: BACKUP_APP_ID,
    exportedAt: now.toISOString(),
    state,
    recordings,
  };
}

/** Parse and check a backup file's text. Returns {state, recordings, exportedAt} or throws. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn’t valid JSON.");
  }
  if (data?.app !== BACKUP_APP_ID || !isObject(data.state)) {
    throw new Error("That file isn’t a French Daily backup.");
  }
  return {
    state: migrate(data.state),
    recordings: Array.isArray(data.recordings) ? data.recordings : [],
    exportedAt: data.exportedAt ?? null,
  };
}
