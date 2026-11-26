const express = require("express");
const repoController = require("../controllers/repoController");
const vcsController = require("../controllers/vcsController");
const {
  authenticateToken,
  optionalAuth,
} = require("../middleware/authMiddleware");
const {
  requireRepoOwner,
  requireRepoReadAccess,
} = require("../middleware/authorizeMiddleware");

const repoRouter = express.Router();

// Repository CRUD
repoRouter.post("/repo/create", authenticateToken, repoController.createRepository);
repoRouter.get("/repo/all", optionalAuth, repoController.getAllRepositories);
repoRouter.get("/repo/name/:name", optionalAuth, repoController.fetchRepositoryByName);
repoRouter.get(
  "/repo/user/:userID",
  optionalAuth,
  repoController.fetchRepositoriesForCurrentUser
);
repoRouter.get(
  "/repo/:id",
  optionalAuth,
  requireRepoReadAccess,
  repoController.fetchRepositoryById
);
repoRouter.put(
  "/repo/update/:id",
  authenticateToken,
  requireRepoOwner,
  repoController.updateRepositoryById
);
repoRouter.delete(
  "/repo/delete/:id",
  authenticateToken,
  requireRepoOwner,
  repoController.deleteRepositoryById
);
repoRouter.patch(
  "/repo/toggle/:id",
  authenticateToken,
  requireRepoOwner,
  repoController.toggleVisibilityById
);

// Custom Version Control System (VCS) endpoints
repoRouter.get(
  "/repo/:id/status",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.getVcsStatus
);
repoRouter.post(
  "/repo/:id/files",
  authenticateToken,
  requireRepoOwner,
  vcsController.upsertWorkingFile
);
repoRouter.delete(
  "/repo/:id/files",
  authenticateToken,
  requireRepoOwner,
  vcsController.deleteWorkingFile
);
repoRouter.post(
  "/repo/:id/stage",
  authenticateToken,
  requireRepoOwner,
  vcsController.stageFiles
);
repoRouter.post(
  "/repo/:id/unstage",
  authenticateToken,
  requireRepoOwner,
  vcsController.unstageFiles
);
repoRouter.post(
  "/repo/:id/commit",
  authenticateToken,
  requireRepoOwner,
  vcsController.commitChanges
);
repoRouter.get(
  "/repo/:id/commits",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.getCommits
);
repoRouter.get(
  "/repo/:id/commits/:hash",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.getCommitDetail
);
repoRouter.get(
  "/repo/:id/diff",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.compareDiff
);
repoRouter.post(
  "/repo/:id/branches",
  authenticateToken,
  requireRepoOwner,
  vcsController.createBranch
);
repoRouter.post(
  "/repo/:id/checkout",
  authenticateToken,
  requireRepoOwner,
  vcsController.checkoutBranch
);
repoRouter.post(
  "/repo/:id/merge",
  authenticateToken,
  requireRepoOwner,
  vcsController.mergeBranch
);
repoRouter.post(
  "/repo/:id/merge/resolve",
  authenticateToken,
  requireRepoOwner,
  vcsController.resolveConflicts
);
repoRouter.post(
  "/repo/:id/merge/abort",
  authenticateToken,
  requireRepoOwner,
  vcsController.abortMerge
);
repoRouter.post(
  "/repo/:id/revert",
  authenticateToken,
  requireRepoOwner,
  vcsController.revertToCommit
);
repoRouter.post(
  "/repo/:id/push",
  authenticateToken,
  requireRepoOwner,
  vcsController.pushRemote
);
repoRouter.get(
  "/repo/:id/pull",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.pullRemote
);
repoRouter.get(
  "/repo/:id/verify",
  optionalAuth,
  requireRepoReadAccess,
  vcsController.verifyRepoIntegrity
);

module.exports = repoRouter;
