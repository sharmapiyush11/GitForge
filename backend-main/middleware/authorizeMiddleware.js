const mongoose = require("mongoose");
const { Repository } = require("../db/models");

async function requireRepoOwner(req, res, next) {
  const repoId = req.params.id || req.params.repoId;
  if (!mongoose.Types.ObjectId.isValid(repoId)) {
    return res.status(400).json({ error: "Invalid repository ID" });
  }

  try {
    const repo = await Repository.findById(repoId);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }
    if (repo.owner.toString() !== String(req.userId)) {
      return res
        .status(403)
        .json({ error: "Only the repository owner can perform this action" });
    }
    req.repository = repo;
    next();
  } catch (err) {
    console.error("Authorization error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function requireRepoReadAccess(req, res, next) {
  const repoId = req.params.id || req.params.repoId;
  if (!mongoose.Types.ObjectId.isValid(repoId)) {
    return res.status(400).json({ error: "Invalid repository ID" });
  }

  try {
    const repo = await Repository.findById(repoId)
      .populate("owner", "username email bio")
      .populate("issues");
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }
    const ownerId = repo.owner?._id
      ? repo.owner._id.toString()
      : repo.owner.toString();
    if (repo.visibility === false && ownerId !== String(req.userId)) {
      return res.status(403).json({ error: "Private repository access denied" });
    }
    req.repository = repo;
    next();
  } catch (err) {
    console.error("Read access error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  requireRepoOwner,
  requireRepoReadAccess,
};
