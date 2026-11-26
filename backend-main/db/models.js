const mongoose = require("mongoose");
const MongooseUser = require("../models/userModel");
const MongooseRepository = require("../models/repoModel");
const MongooseCommit = require("../models/commitModel");
const MongooseIssue = require("../models/issueModel");
const { createLocalModel } = require("./localDb");

const LocalUser = createLocalModel(
  "users",
  {
    bio: "Building with GitForge custom version control.",
    repositories: [],
    followedUsers: [],
    starRepos: [],
  },
  {
    repositories: "repositories",
    starRepos: "repositories",
    followedUsers: "users",
  }
);

const LocalRepository = createLocalModel(
  "repositories",
  {
    description: "",
    content: [],
    visibility: true,
    defaultBranch: "main",
    currentBranch: "main",
    branches: [{ name: "main", headHash: null }],
    workingFiles: [],
    stagedFiles: [],
    pendingMerge: null,
    stars: [],
    issues: [],
  },
  {
    owner: "users",
    issues: "issues",
  }
);

const LocalCommit = createLocalModel(
  "commits",
  {
    parents: [],
    files: [],
    changes: [],
    stats: { added: 0, modified: 0, deleted: 0, additions: 0, deletions: 0 },
    type: "commit",
  },
  {
    author: "users",
    repository: "repositories",
  }
);

const LocalIssue = createLocalModel(
  "issues",
  {
    status: "open",
  },
  {
    author: "users",
    repository: "repositories",
  }
);

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function createAdaptiveModel(mongooseModel, localModel) {
  const TargetFn = function (data) {
    const active = isMongoConnected() ? mongooseModel : localModel;
    return new active(data);
  };

  return new Proxy(TargetFn, {
    get(_, prop) {
      const active = isMongoConnected() ? mongooseModel : localModel;
      const val = active[prop];
      return typeof val === "function" ? val.bind(active) : val;
    },
    construct(_, args) {
      const active = isMongoConnected() ? mongooseModel : localModel;
      return new active(...args);
    },
  });
}

module.exports = {
  User: createAdaptiveModel(MongooseUser, LocalUser),
  Repository: createAdaptiveModel(MongooseRepository, LocalRepository),
  Commit: createAdaptiveModel(MongooseCommit, LocalCommit),
  Issue: createAdaptiveModel(MongooseIssue, LocalIssue),
  isMongoConnected,
};
