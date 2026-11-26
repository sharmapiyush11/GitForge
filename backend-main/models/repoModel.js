const mongoose = require("mongoose");
const { Schema } = mongoose;

const WorkingFileSchema = new Schema(
  {
    path: { type: String, required: true },
    content: { type: String, default: "" },
    sha256: { type: String, required: true },
  },
  { _id: false }
);

const StagedFileSchema = new Schema(
  {
    path: { type: String, required: true },
    content: { type: String, default: "" },
    sha256: { type: String, default: null },
    status: {
      type: String,
      enum: ["added", "modified", "deleted"],
      required: true,
    },
  },
  { _id: false }
);

const BranchSchema = new Schema(
  {
    name: { type: String, required: true },
    headHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConflictSchema = new Schema(
  {
    path: { type: String, required: true },
    reason: { type: String, default: "both-modified" },
    baseContent: { type: String, default: "" },
    oursContent: { type: String, default: "" },
    theirsContent: { type: String, default: "" },
    mergedContent: { type: String, default: "" },
    baseHash: { type: String, default: null },
    oursHash: { type: String, default: null },
    theirsHash: { type: String, default: null },
  },
  { _id: false }
);

const RepositorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    content: [
      {
        type: String,
      },
    ],
    visibility: {
      type: Boolean,
      default: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    defaultBranch: {
      type: String,
      default: "main",
    },
    currentBranch: {
      type: String,
      default: "main",
    },
    branches: {
      type: [BranchSchema],
      default: [{ name: "main", headHash: null }],
    },
    workingFiles: {
      type: [WorkingFileSchema],
      default: [],
    },
    stagedFiles: {
      type: [StagedFileSchema],
      default: [],
    },
    pendingMerge: {
      type: {
        sourceBranch: String,
        targetBranch: String,
        baseHash: String,
        sourceHash: String,
        targetHash: String,
        conflicts: [ConflictSchema],
      },
      default: null,
    },
    stars: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    issues: [
      {
        type: Schema.Types.ObjectId,
        ref: "Issue",
      },
    ],
  },
  { timestamps: true }
);

RepositorySchema.index({ owner: 1, name: 1 }, { unique: true });

const Repository = mongoose.model("Repository", RepositorySchema);
module.exports = Repository;
