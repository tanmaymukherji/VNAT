// Client-side document storage using native IndexedDB

const DB_NAME = 'TranslationTool';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains('projects')) {
        db.deleteObjectStore('projects');
      }
      const store = db.createObjectStore('projects', { keyPath: 'id' });
      store.createIndex('folder_path', 'folder_path', { unique: false });
      store.createIndex('name', 'name', { unique: false });
      store.createIndex('created_at', 'created_at', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise = null;

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function isValidKey(value) {
  if (value === null || value === undefined) return false;
  const t = typeof value;
  if (t === 'number') return isFinite(value);
  if (t === 'string') return true;
  return false;
}

export async function listProjects() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const request = store.getAll();
    request.onsuccess = () => {
      const projects = request.result || [];
      projects.sort((a, b) => {
        const da = a.last_opened || a.created_at || 0;
        const db2 = b.last_opened || b.created_at || 0;
        return db2 - da;
      });
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project) {
  const db = await getDB();

  if (!project || typeof project !== 'object') {
    throw new Error('saveProject: project must be an object, got ' + typeof project);
  }

  const now = Date.now();
  const keys = Object.keys(project);

  // Log what we received
  console.log('[saveProject] keys:', keys.join(','));
  console.log('[saveProject] id:', project.id, 'type:', typeof project.id);

  // Generate a string ID for new records, reuse existing if valid
  let finalId;
  if (project.id != null && isValidKey(project.id)) {
    finalId = project.id;
  } else {
    finalId = 'p_' + now + '_' + Math.random().toString(36).slice(2, 8);
  }

  console.log('[saveProject] finalId:', finalId, 'type:', typeof finalId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');

    // Build clean object with no undefined values
    const toStore = {};
    for (const k of keys) {
      const v = project[k];
      if (v !== undefined && k !== 'id') {
        toStore[k] = v;
      }
    }
    toStore.id = finalId;
    toStore.last_opened = now;
    if (!('created_at' in toStore)) {
      toStore.created_at = now;
    }

    const request = store.put(toStore);
    request.onsuccess = () => resolve(toStore);
    request.onerror = () => {
      const err = request.error;
      console.error('[saveProject] FAILED:', err ? err.message : 'unknown', 'id:', finalId);
      reject(err || new Error('IndexedDB put failed'));
    };
  });
}

export async function deleteProject(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function createProject(name, folderPath, content, paragraphs) {
  return saveProject({ name, folder_path: folderPath, content, paragraphs });
}
