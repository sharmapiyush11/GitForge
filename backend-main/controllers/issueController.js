const mongoose = require("mongoose");
const { Repository, Issue } = require("../db/models");

async function createIssue(req, res) {
  const { title, description } = req.body;
  const repoId = req.params.repoId || req.params.id || req.body.repository;

  try {
    if (!title || !description) {
      return res
        .status(400)
        .json({ error: "Issue title and description are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(repoId)) {
      return res.status(400).json({ error: "Invalid repository ID" });
    }

    const repo = await Repository.findById(repoId);
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const issue = await Issue.create({
      title: title.trim(),
      description: description.trim(),
      repository: repo._id,
      author: req.userId || undefined,
    });

    repo.issues.push(issue._id);
    await repo.save();

    const populated = await Issue.findById(issue._id).populate(
      "author",
      "username"
    );
    res.status(201).json(populated);
  } catch (err) {
    console.error("Error during issue creation:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function updateIssueById(req, res) {
  const { id } = req.params;
  const { title, description, status } = req.body;
  try {
    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({ error: "Issue not found!" });
    }

    if (title !== undefined) issue.title = title;
    if (description !== undefined) issue.description = description;
    if (status !== undefined) issue.status = status;

    await issue.save();
    res.json({ message: "Issue updated", issue });
  } catch (err) {
    console.error("Error during issue update:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteIssueById(req, res) {
  const { id } = req.params;
  try {
    const issue = await Issue.findByIdAndDelete(id);
    if (!issue) {
      return res.status(404).json({ error: "Issue not found!" });
    }
    await Repository.findByIdAndUpdate(issue.repository, {
      $pull: { issues: issue._id },
    });
    res.json({ message: "Issue deleted" });
  } catch (err) {
    console.error("Error during issue deletion:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getAllIssues(req, res) {
  const repoId = req.params.repoId || req.params.id;
  try {
    const filter = repoId ? { repository: repoId } : {};
    const issues = await Issue.find(filter)
      .populate("author", "username")
      .sort({ createdAt: -1 });
    res.status(200).json(issues);
  } catch (err) {
    console.error("Error fetching issues:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getIssueById(req, res) {
  const { id } = req.params;
  try {
    const issue = await Issue.findById(id).populate("author", "username");
    if (!issue) {
      return res.status(404).json({ error: "Issue not found!" });
    }
    res.json(issue);
  } catch (err) {
    console.error("Error fetching issue:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  createIssue,
  updateIssueById,
  deleteIssueById,
  getAllIssues,
  getIssueById,
};
