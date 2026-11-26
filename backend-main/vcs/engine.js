const crypto = require("crypto");

/**
 * Compute SHA-256 hex digest for string or Buffer content.
 */
function sha256(content) {
  const input = Buffer.isBuffer(content) ? content : String(content ?? "");
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Normalize an array or map of files into a sorted array of { path, content, sha256 }.
 */
function normalizeFiles(files) {
  const list = [];
  if (Array.isArray(files)) {
    for (const item of files) {
      if (!item || !item.path) continue;
      const content = String(item.content ?? "");
      list.push({
        path: item.path,
        content,
        sha256: item.sha256 || sha256(content),
      });
    }
  } else if (files && typeof files === "object") {
    for (const [filePath, value] of Object.entries(files)) {
      const content =
        typeof value === "string" ? value : String(value?.content ?? "");
      list.push({
        path: filePath,
        content,
        sha256:
          typeof value === "object" && value?.sha256
            ? value.sha256
            : sha256(content),
      });
    }
  }
  return list.sort((a, b) => a.path.localeCompare(b.path));
}

function toFileMap(files) {
  const map = new Map();
  for (const file of normalizeFiles(files)) {
    map.set(file.path, file);
  }
  return map;
}

/**
 * Compute deterministic SHA-256 commit hash from commit metadata and file tree hashes.
 */
function computeCommitHash({
  branch = "main",
  parents = [],
  message = "",
  timestamp = new Date().toISOString(),
  files = [],
}) {
  const treeEntries = normalizeFiles(files).map(
    (f) => `${f.path}:${f.sha256}`
  );
  const payload = JSON.stringify({
    branch,
    parents,
    message,
    timestamp,
    tree: treeEntries,
  });
  return sha256(payload);
}

/**
 * Split text into lines, preserving empty string as 0 lines.
 */
function splitLines(text) {
  if (text === "" || text === null || text === undefined) return [];
  return String(text).replace(/\r\n/g, "\n").split("\n");
}

/**
 * Compute line-by-line diff using LCS dynamic programming.
 */
function computeLineDiff(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const m = a.length;
  const n = b.length;

  // Guard against quadratic memory on huge files by matching common prefix/suffix first
  let prefix = 0;
  while (prefix < m && prefix < n && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    a[m - 1 - suffix] === b[n - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, m - suffix);
  const midB = b.slice(prefix, n - suffix);
  const mm = midA.length;
  const nn = midB.length;

  const lines = [];
  for (let i = 0; i < prefix; i++) {
    lines.push({
      type: "context",
      oldLine: i + 1,
      newLine: i + 1,
      text: a[i],
    });
  }

  if (mm * nn <= 250000) {
    const dp = Array.from({ length: mm + 1 }, () => new Int32Array(nn + 1));
    for (let i = mm - 1; i >= 0; i--) {
      for (let j = nn - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < mm && j < nn) {
      if (midA[i] === midB[j]) {
        lines.push({
          type: "context",
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1,
          text: midA[i],
        });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({
          type: "del",
          oldLine: prefix + i + 1,
          newLine: null,
          text: midA[i],
        });
        i++;
      } else {
        lines.push({
          type: "add",
          oldLine: null,
          newLine: prefix + j + 1,
          text: midB[j],
        });
        j++;
      }
    }
    while (i < mm) {
      lines.push({
        type: "del",
        oldLine: prefix + i + 1,
        newLine: null,
        text: midA[i],
      });
      i++;
    }
    while (j < nn) {
      lines.push({
        type: "add",
        oldLine: null,
        newLine: prefix + j + 1,
        text: midB[j],
      });
      j++;
    }
  } else {
    for (let i = 0; i < mm; i++) {
      lines.push({
        type: "del",
        oldLine: prefix + i + 1,
        newLine: null,
        text: midA[i],
      });
    }
    for (let j = 0; j < nn; j++) {
      lines.push({
        type: "add",
        oldLine: null,
        newLine: prefix + j + 1,
        text: midB[j],
      });
    }
  }

  for (let s = 0; s < suffix; s++) {
    lines.push({
      type: "context",
      oldLine: m - suffix + s + 1,
      newLine: n - suffix + s + 1,
      text: a[m - suffix + s],
    });
  }

  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.type === "add") additions++;
    if (line.type === "del") deletions++;
  }

  return { lines, additions, deletions };
}

/**
 * Compare two file snapshots and return per-file SHA-256 status and line diffs.
 */
function diffTrees(baseFiles = [], targetFiles = [], { includeUnchanged = false } = {}) {
  const baseMap = toFileMap(baseFiles);
  const targetMap = toFileMap(targetFiles);
  const allPaths = Array.from(
    new Set([...baseMap.keys(), ...targetMap.keys()])
  ).sort();

  const changes = [];
  const summary = {
    added: 0,
    modified: 0,
    deleted: 0,
    unchanged: 0,
    additions: 0,
    deletions: 0,
  };

  for (const filePath of allPaths) {
    const base = baseMap.get(filePath);
    const target = targetMap.get(filePath);

    if (!base && target) {
      const diff = computeLineDiff("", target.content);
      summary.added++;
      summary.additions += diff.additions;
      changes.push({
        path: filePath,
        status: "added",
        oldHash: null,
        newHash: target.sha256,
        diff,
      });
    } else if (base && !target) {
      const diff = computeLineDiff(base.content, "");
      summary.deleted++;
      summary.deletions += diff.deletions;
      changes.push({
        path: filePath,
        status: "deleted",
        oldHash: base.sha256,
        newHash: null,
        diff,
      });
    } else if (base.sha256 !== target.sha256) {
      const diff = computeLineDiff(base.content, target.content);
      summary.modified++;
      summary.additions += diff.additions;
      summary.deletions += diff.deletions;
      changes.push({
        path: filePath,
        status: "modified",
        oldHash: base.sha256,
        newHash: target.sha256,
        diff,
      });
    } else {
      summary.unchanged++;
      if (includeUnchanged) {
        changes.push({
          path: filePath,
          status: "unchanged",
          oldHash: base.sha256,
          newHash: target.sha256,
          diff: { lines: [], additions: 0, deletions: 0 },
        });
      }
    }
  }

  return { changes, summary };
}

/**
 * Extract edit hunks relative to base line indices: { start, end, lines }.
 */
function extractEditRegions(baseText, sideText) {
  const { lines } = computeLineDiff(baseText, sideText);
  const regions = [];
  let baseCursor = 0;
  let current = null;

  for (const entry of lines) {
    if (entry.type === "context") {
      if (current) {
        regions.push(current);
        current = null;
      }
      baseCursor = entry.oldLine;
    } else if (entry.type === "del") {
      if (!current) {
        current = { start: baseCursor, end: baseCursor, lines: [] };
      }
      current.end = entry.oldLine;
      baseCursor = entry.oldLine;
    } else if (entry.type === "add") {
      if (!current) {
        current = { start: baseCursor, end: baseCursor, lines: [] };
      }
      current.lines.push(entry.text);
    }
  }
  if (current) regions.push(current);
  return regions;
}

function applyRegionsToSlice(baseLines, regions, sliceStart, sliceEnd) {
  const out = [];
  let cursor = sliceStart;
  for (const reg of regions) {
    while (cursor < reg.start) {
      out.push(baseLines[cursor]);
      cursor++;
    }
    out.push(...reg.lines);
    cursor = reg.end;
  }
  while (cursor < sliceEnd) {
    out.push(baseLines[cursor]);
    cursor++;
  }
  return out;
}

/**
 * Perform a line-level three-way merge for a single file.
 */
function mergeFileContent(
  baseText,
  oursText,
  theirsText,
  oursLabel = "HEAD",
  theirsLabel = "incoming"
) {
  if (oursText === theirsText) {
    return { mergedContent: oursText, hasConflict: false };
  }
  if (oursText === baseText) {
    return { mergedContent: theirsText, hasConflict: false };
  }
  if (theirsText === baseText) {
    return { mergedContent: oursText, hasConflict: false };
  }

  const baseLines = splitLines(baseText);
  const oursRegions = extractEditRegions(baseText, oursText);
  const theirsRegions = extractEditRegions(baseText, theirsText);

  const mergedLines = [];
  let hasConflict = false;
  let cursor = 0;
  let oi = 0;
  let ti = 0;

  while (oi < oursRegions.length || ti < theirsRegions.length) {
    const oReg = oursRegions[oi];
    const tReg = theirsRegions[ti];

    if (oReg && (!tReg || oReg.end < tReg.start || (oReg.end === tReg.start && oReg.start < tReg.start))) {
      while (cursor < oReg.start) {
        mergedLines.push(baseLines[cursor++]);
      }
      mergedLines.push(...oReg.lines);
      cursor = oReg.end;
      oi++;
    } else if (tReg && (!oReg || tReg.end < oReg.start || (tReg.end === oReg.start && tReg.start < oReg.start))) {
      while (cursor < tReg.start) {
        mergedLines.push(baseLines[cursor++]);
      }
      mergedLines.push(...tReg.lines);
      cursor = tReg.end;
      ti++;
    } else {
      // Overlapping or same-position edits: group all transitively overlapping regions
      let groupStart = Math.min(oReg.start, tReg.start);
      let groupEnd = Math.max(oReg.end, tReg.end);
      const oGroup = [oReg];
      const tGroup = [tReg];
      oi++;
      ti++;

      let expanded = true;
      while (expanded) {
        expanded = false;
        while (oi < oursRegions.length && oursRegions[oi].start <= groupEnd) {
          groupEnd = Math.max(groupEnd, oursRegions[oi].end);
          oGroup.push(oursRegions[oi++]);
          expanded = true;
        }
        while (ti < theirsRegions.length && theirsRegions[ti].start <= groupEnd) {
          groupEnd = Math.max(groupEnd, theirsRegions[ti].end);
          tGroup.push(theirsRegions[ti++]);
          expanded = true;
        }
      }

      while (cursor < groupStart) {
        mergedLines.push(baseLines[cursor++]);
      }

      const oursSlice = applyRegionsToSlice(baseLines, oGroup, groupStart, groupEnd);
      const theirsSlice = applyRegionsToSlice(baseLines, tGroup, groupStart, groupEnd);

      if (oursSlice.join("\n") === theirsSlice.join("\n")) {
        mergedLines.push(...oursSlice);
      } else {
        hasConflict = true;
        mergedLines.push(`<<<<<<< ${oursLabel}`);
        mergedLines.push(...oursSlice);
        mergedLines.push("=======");
        mergedLines.push(...theirsSlice);
        mergedLines.push(`>>>>>>> ${theirsLabel}`);
      }
      cursor = groupEnd;
    }
  }

  while (cursor < baseLines.length) {
    mergedLines.push(baseLines[cursor++]);
  }

  return { mergedContent: mergedLines.join("\n"), hasConflict };
}

/**
 * Perform a three-way merge between base, ours, and theirs file trees.
 */
function threeWayMerge({
  baseFiles = [],
  oursFiles = [],
  theirsFiles = [],
  oursLabel = "main",
  theirsLabel = "feature",
}) {
  const baseMap = toFileMap(baseFiles);
  const oursMap = toFileMap(oursFiles);
  const theirsMap = toFileMap(theirsFiles);
  const allPaths = Array.from(
    new Set([...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()])
  ).sort();

  const mergedFiles = [];
  const conflicts = [];
  const autoMerged = [];

  for (const filePath of allPaths) {
    const base = baseMap.get(filePath);
    const ours = oursMap.get(filePath);
    const theirs = theirsMap.get(filePath);

    const baseHash = base?.sha256 ?? null;
    const oursHash = ours?.sha256 ?? null;
    const theirsHash = theirs?.sha256 ?? null;

    if (oursHash === theirsHash) {
      if (ours) mergedFiles.push(ours);
      continue;
    }

    if (oursHash === baseHash) {
      if (theirs) {
        mergedFiles.push(theirs);
        autoMerged.push({ path: filePath, resolution: "accepted-incoming" });
      } else {
        autoMerged.push({ path: filePath, resolution: "deleted-by-incoming" });
      }
      continue;
    }

    if (theirsHash === baseHash) {
      if (ours) {
        mergedFiles.push(ours);
        autoMerged.push({ path: filePath, resolution: "kept-current" });
      } else {
        autoMerged.push({ path: filePath, resolution: "deleted-by-current" });
      }
      continue;
    }

    // Both modified (or added/deleted incompatibly)
    if (ours && theirs) {
      const baseContent = base ? base.content : "";
      const { mergedContent, hasConflict } = mergeFileContent(
        baseContent,
        ours.content,
        theirs.content,
        oursLabel,
        theirsLabel
      );
      const mergedEntry = {
        path: filePath,
        content: mergedContent,
        sha256: sha256(mergedContent),
      };
      mergedFiles.push(mergedEntry);

      if (hasConflict) {
        conflicts.push({
          path: filePath,
          reason: base ? "both-modified" : "both-added",
          baseContent,
          oursContent: ours.content,
          theirsContent: theirs.content,
          mergedContent,
          baseHash,
          oursHash,
          theirsHash,
        });
      } else {
        autoMerged.push({ path: filePath, resolution: "3-way-auto-merged" });
      }
    } else {
      // Modify vs Delete conflict
      const present = ours || theirs;
      const conflictText = [
        `<<<<<<< ${oursLabel}`,
        ours ? ours.content : "[DELETED IN CURRENT BRANCH]",
        "=======",
        theirs ? theirs.content : "[DELETED IN INCOMING BRANCH]",
        `>>>>>>> ${theirsLabel}`,
      ].join("\n");

      mergedFiles.push({
        path: filePath,
        content: conflictText,
        sha256: sha256(conflictText),
      });
      conflicts.push({
        path: filePath,
        reason: "modify-delete-conflict",
        baseContent: base?.content ?? "",
        oursContent: ours?.content ?? "",
        theirsContent: theirs?.content ?? "",
        mergedContent: conflictText,
        baseHash,
        oursHash,
        theirsHash,
        fallbackContent: present?.content ?? "",
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    autoMerged,
    mergedFiles: normalizeFiles(mergedFiles),
  };
}

/**
 * Verify SHA-256 integrity of every file in a snapshot (and optional commit hash).
 */
function verifyIntegrity(files = [], commit = null) {
  const fileChecks = (Array.isArray(files) ? files : normalizeFiles(files)).map(
    (file) => {
      const actualHash = sha256(file.content ?? "");
      const valid = file.sha256 ? file.sha256 === actualHash : true;
      return {
        path: file.path,
        storedHash: file.sha256 || actualHash,
        computedHash: actualHash,
        valid,
      };
    }
  );

  let commitHashValid = true;
  let computedCommitHash = null;
  if (commit && commit.hash) {
    computedCommitHash = computeCommitHash({
      branch: commit.branch,
      parents: commit.parents || [],
      message: commit.message,
      timestamp: commit.timestamp,
      files: commit.files || files,
    });
    commitHashValid = computedCommitHash === commit.hash;
  }

  return {
    valid: fileChecks.every((f) => f.valid) && commitHashValid,
    commitHashValid,
    computedCommitHash,
    files: fileChecks,
  };
}

module.exports = {
  sha256,
  normalizeFiles,
  toFileMap,
  computeCommitHash,
  splitLines,
  computeLineDiff,
  diffTrees,
  mergeFileContent,
  threeWayMerge,
  verifyIntegrity,
};
