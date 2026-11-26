const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_FILE = path.resolve(__dirname, "../.local-db.json");
const BLOB_KEY = "gitforge/db.json";

function generateObjectId() {
  return crypto.randomBytes(12).toString("hex");
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function emptyStore() {
  return { users: [], repositories: [], commits: [], issues: [] };
}

function loadLocalFileStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch {
    // ignore corrupt file and reset
  }
  return emptyStore();
}

let store = loadLocalFileStore();

async function hydrateStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = require("@vercel/blob");
      const result = await get(BLOB_KEY, {
        access: "private",
        useCache: false,
      });
      if (result && result.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          store = {
            users: parsed.users || [],
            repositories: parsed.repositories || [],
            commits: parsed.commits || [],
            issues: parsed.issues || [],
          };
          return store;
        }
      }
    } catch (err) {
      if (err?.name !== "BlobNotFoundError") {
        console.error("Vercel Blob hydrate warning:", err.message);
      }
    }
    return store;
  }

  store = loadLocalFileStore();
  return store;
}

async function persistStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require("@vercel/blob");
    await put(BLOB_KEY, JSON.stringify(store), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("Local DB persist warning:", err.message);
  }
}

function getValue(obj, field) {
  if (!obj) return undefined;
  return field.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function matchesFilter(doc, filter = {}) {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(cond)) {
      if (!cond.some((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    const val = getValue(doc, key);
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("$in" in cond) {
        if (!cond.$in.map(String).includes(String(val))) return false;
        continue;
      }
    }
    if (Array.isArray(val)) {
      if (!val.map(String).includes(String(cond))) return false;
    } else if (String(val) !== String(cond)) {
      return false;
    }
  }
  return true;
}

function applySelect(doc, selectStr) {
  if (!doc || !selectStr) return doc;
  const out = clone(doc);
  const parts = selectStr.trim().split(/\s+/);
  const excludes = parts.filter((p) => p.startsWith("-")).map((p) => p.slice(1));
  const includes = parts.filter((p) => !p.startsWith("-"));

  if (includes.length > 0) {
    const picked = { _id: out._id };
    for (const f of includes) {
      if (f in out) picked[f] = out[f];
    }
    return picked;
  }
  for (const f of excludes) {
    delete out[f];
  }
  return out;
}

function applyPopulate(doc, populates = [], refs = {}) {
  if (!doc || populates.length === 0) return doc;
  const out = clone(doc);
  for (const { field, select } of populates) {
    const refCollection = refs[field];
    if (!refCollection || !(field in out)) continue;
    const raw = out[field];
    if (Array.isArray(raw)) {
      out[field] = raw
        .map((id) => {
          const match = (store[refCollection] || []).find(
            (item) => String(item._id) === String(id?._id || id)
          );
          return match ? applySelect(match, select) : null;
        })
        .filter(Boolean);
    } else if (raw) {
      const match = (store[refCollection] || []).find(
        (item) => String(item._id) === String(raw?._id || raw)
      );
      out[field] = match ? applySelect(match, select) : raw;
    }
  }
  return out;
}

function wrapDoc(collection, rawDoc, refs) {
  const doc = clone(rawDoc);
  doc.toObject = () => {
    const copy = { ...doc };
    delete copy.toObject;
    delete copy.save;
    return clone(copy);
  };
  doc.save = async () => {
    doc.updatedAt = new Date().toISOString();
    const list = store[collection];
    const clean = doc.toObject();
    const idx = list.findIndex((d) => String(d._id) === String(clean._id));
    if (idx >= 0) {
      list[idx] = clean;
    } else {
      list.push(clean);
    }
    await persistStore();
    return wrapDoc(collection, clean, refs);
  };
  return doc;
}

function createQuery(executeFn, { single = false, collection, refs } = {}) {
  let selectStr = null;
  const populates = [];
  let sortSpec = null;
  let isLean = false;

  const query = {
    select(s) {
      selectStr = s;
      return query;
    },
    populate(field, select = null) {
      populates.push({ field, select });
      return query;
    },
    sort(spec) {
      sortSpec = spec;
      return query;
    },
    lean() {
      isLean = true;
      return query;
    },
    async exec() {
      let res = await executeFn();
      if (single) {
        if (!res) return null;
        let out = applyPopulate(res, populates, refs);
        out = applySelect(out, selectStr);
        return isLean ? out : wrapDoc(collection, out, refs);
      }
      if (sortSpec) {
        const [[field, dir]] = Object.entries(sortSpec);
        res = [...res].sort((a, b) => {
          const av = a[field] || "";
          const bv = b[field] || "";
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (dir >= 0 ? 1 : -1);
        });
      }
      return res.map((item) => {
        let out = applyPopulate(item, populates, refs);
        out = applySelect(out, selectStr);
        return isLean ? out : wrapDoc(collection, out, refs);
      });
    },
    then(resolve, reject) {
      return query.exec().then(resolve, reject);
    },
  };
  return query;
}

function createLocalModel(collection, defaults = {}, refs = {}) {
  if (!store[collection]) store[collection] = [];

  function LocalModel(data = {}) {
    const now = new Date().toISOString();
    const base = {
      _id: generateObjectId(),
      ...clone(defaults),
      ...clone(data),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
    return wrapDoc(collection, base, refs);
  }

  LocalModel.create = async (data) => {
    const doc = LocalModel(data);
    return doc.save();
  };

  LocalModel.find = (filter = {}) =>
    createQuery(
      () => store[collection].filter((d) => matchesFilter(d, filter)),
      { single: false, collection, refs }
    );

  LocalModel.findOne = (filter = {}) =>
    createQuery(
      () => store[collection].find((d) => matchesFilter(d, filter)) || null,
      { single: true, collection, refs }
    );

  LocalModel.findById = (id) =>
    createQuery(
      () => store[collection].find((d) => String(d._id) === String(id)) || null,
      { single: true, collection, refs }
    );

  LocalModel.findByIdAndUpdate = (id, update = {}) =>
    createQuery(
      async () => {
        const idx = store[collection].findIndex(
          (d) => String(d._id) === String(id)
        );
        if (idx < 0) return null;
        const current = clone(store[collection][idx]);
        if (update.$set) Object.assign(current, update.$set);
        if (update.$pull) {
          for (const [k, v] of Object.entries(update.$pull)) {
            if (Array.isArray(current[k])) {
              current[k] = current[k].filter((item) => String(item) !== String(v));
            }
          }
        }
        current.updatedAt = new Date().toISOString();
        store[collection][idx] = current;
        await persistStore();
        return current;
      },
      { single: true, collection, refs }
    );

  LocalModel.findByIdAndDelete = async (id) => {
    const idx = store[collection].findIndex(
      (d) => String(d._id) === String(id)
    );
    if (idx < 0) return null;
    const [removed] = store[collection].splice(idx, 1);
    await persistStore();
    return removed;
  };

  LocalModel.updateMany = async (filter = {}, update = {}) => {
    let modified = 0;
    for (const doc of store[collection]) {
      if (!matchesFilter(doc, filter)) continue;
      if (update.$pull) {
        for (const [k, v] of Object.entries(update.$pull)) {
          if (Array.isArray(doc[k])) {
            doc[k] = doc[k].filter((item) => String(item) !== String(v));
          }
        }
      }
      if (update.$set) Object.assign(doc, update.$set);
      doc.updatedAt = new Date().toISOString();
      modified++;
    }
    if (modified > 0) await persistStore();
    return { modifiedCount: modified };
  };

  LocalModel.deleteMany = async (filter = {}) => {
    const before = store[collection].length;
    store[collection] = store[collection].filter(
      (d) => !matchesFilter(d, filter)
    );
    const deletedCount = before - store[collection].length;
    if (deletedCount > 0) await persistStore();
    return { deletedCount };
  };

  LocalModel.countDocuments = async (filter = {}) =>
    store[collection].filter((d) => matchesFilter(d, filter)).length;

  return LocalModel;
}

module.exports = {
  createLocalModel,
  generateObjectId,
  hydrateStore,
};
