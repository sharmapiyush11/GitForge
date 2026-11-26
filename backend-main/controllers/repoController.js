const mongoose = require("mongoose");
const { Repository, User, Commit } = require("../db/models");
const { sha256, computeCommitHash, normalizeFiles } = require("../vcs/engine");

async function createRepository(req, res) {
  const {
    owner: bodyOwner,
    name,
    description = "",
    visibility = true,
    initialFiles,
  } = req.body;
  const owner = req.userId || bodyOwner;

  try {
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Repository name is required!" });
    }
    if (!mongoose.Types.ObjectId.isValid(owner)) {
      return res.status(400).json({ error: "Invalid User ID!" });
    }

    const user = await User.findById(owner);
    if (!user) {
      return res.status(404).json({ error: "Owner user not found!" });
    }

    const trimmedName = name.trim();
    const duplicate = await Repository.findOne({ owner, name: trimmedName });
    if (duplicate) {
      return res
        .status(400)
        .json({ error: "You already have a repository with this name." });
    }

    const readmeContent = `# ${trimmedName}\n\n${
      description || "Initialized with GitForge custom version control."
    }\n`;

    const files = normalizeFiles(
      Array.isArray(initialFiles) && initialFiles.length > 0
        ? initialFiles
        : [{ path: "README.md", content: readmeContent }]
    );

    const timestamp = new Date().toISOString();
    const initHash = computeCommitHash({
      branch: "main",
      parents: [],
      message: "Initial commit: repository initialized",
      timestamp,
      files,
    });

    const newRepository = new Repository({
      name: trimmedName,
      description,
      visibility: Boolean(visibility),
      owner,
      defaultBranch: "main",
      currentBranch: "main",
      branches: [{ name: "main", headHash: initHash }],
      workingFiles: files,
      stagedFiles: [],
      content: files.map((f) => f.path),
    });

    const savedRepo = await newRepository.save();

    const initCommit = await Commit.create({
      hash: initHash,
      shortHash: initHash.slice(0, 7),
      repository: savedRepo._id,
      author: user._id,
      authorName: user.username,
      branch: "main",
      parents: [],
      message: "Initial commit: repository initialized",
      type: "init",
      timestamp,
      files,
      changes: files.map((f) => ({
        path: f.path,
        status: "added",
        oldHash: null,
        newHash: f.sha256,
        additions: f.content.split("\n").length,
        deletions: 0,
      })),
      stats: {
        added: files.length,
        modified: 0,
        deleted: 0,
        additions: files.reduce(
          (acc, f) => acc + f.content.split("\n").length,
          0
        ),
        deletions: 0,
      },
    });

    user.repositories.push(savedRepo._id);
    await user.save();

    res.status(201).json({
      message: "Repository created & initialized!",
      repositoryID: savedRepo._id,
      repository: savedRepo,
      initialCommit: initCommit,
    });
  } catch (err) {
    console.error("Error during repository creation:", err.message);
    res.status(500).json({ error: "Server error creating repository" });
  }
}

async function getAllRepositories(req, res) {
  try {
    const query = req.userId
      ? { $or: [{ visibility: true }, { owner: req.userId }] }
      : { visibility: true };

    const repositories = await Repository.find(query)
      .populate("owner", "username email")
      .populate("issues")
      .sort({ updatedAt: -1 })
      .lean();

    res.json(repositories);
  } catch (err) {
    console.error("Error fetching repositories:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoryById(req, res) {
  try {
    const repo = req.repository;
    const commitCount = await Commit.countDocuments({ repository: repo._id });
    const repoObj = repo.toObject ? repo.toObject() : repo;
    repoObj.commitCount = commitCount;
    res.json(repoObj);
  } catch (err) {
    console.error("Error fetching repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoryByName(req, res) {
  const { name } = req.params;
  try {
    const repositories = await Repository.find({
      name,
      $or: [{ visibility: true }, ...(req.userId ? [{ owner: req.userId }] : [])],
    })
      .populate("owner", "username email")
      .populate("issues");

    res.json(repositories);
  } catch (err) {
    console.error("Error fetching repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoriesForCurrentUser(req, res) {
  const { userID } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userID)) {
    return res.status(400).json({ error: "Invalid User ID" });
  }

  try {
    const query =
      String(req.userId) === String(userID)
        ? { owner: userID }
        : { owner: userID, visibility: true };

    const repositories = await Repository.find(query)
      .populate("owner", "username email")
      .sort({ updatedAt: -1 });

    res.json({
      message: "Repositories fetched!",
      repositories,
    });
  } catch (err) {
    console.error("Error fetching user repositories:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function updateRepositoryById(req, res) {
  const { description, name } = req.body;
  try {
    const repository = req.repository;
    if (name !== undefined && name.trim()) repository.name = name.trim();
    if (description !== undefined) repository.description = description;

    const updatedRepository = await repository.save();
    res.json({
      message: "Repository updated successfully!",
      repository: updatedRepository,
    });
  } catch (err) {
    console.error("Error updating repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function toggleVisibilityById(req, res) {
  try {
    const repository = req.repository;
    repository.visibility = !repository.visibility;
    const updatedRepository = await repository.save();

    res.json({
      message: "Repository visibility toggled successfully!",
      repository: updatedRepository,
    });
  } catch (err) {
    console.error("Error toggling visibility:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteRepositoryById(req, res) {
  try {
    const repository = req.repository;
    await Commit.deleteMany({ repository: repository._id });
    await User.updateMany(
      {},
      { $pull: { repositories: repository._id, starRepos: repository._id } }
    );
    await Repository.findByIdAndDelete(repository._id);

    res.json({ message: "Repository deleted successfully!" });
  } catch (err) {
    console.error("Error deleting repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  createRepository,
  getAllRepositories,
  fetchRepositoryById,
  fetchRepositoryByName,
  fetchRepositoriesForCurrentUser,
  updateRepositoryById,
  toggleVisibilityById,
  deleteRepositoryById,
};
