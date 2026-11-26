const mongoose = require("mongoose");
const { Schema } = mongoose;

const FileSnapshotSchema = new Schema(
  {
    path: { type: String, required: true },
    content: { type: String, default: "" },
    sha256: { type: String, required: true },
  },
  { _id: false }
);

const FileChangeSchema = new Schema(
  {
    path: { type: String, required: true },
    status: {
      type: String,
      enum: ["added", "modified", "deleted"],
      required: true,
    },
    oldHash: { type: String, default: null },
    newHash: { type: String, default: null },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
  },
  { _id: false }
);

const CommitSchema = new Schema(
  {
    hash: {
      type: String,
      required: true,
      index: true,
    },
    shortHash: {
      type: String,
      required: true,
    },
    repository: {
      type: Schema.Types.ObjectId,
      ref: "Repository",
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    authorName: {
      type: String,
      default: "Developer",
    },
    branch: {
      type: String,
      default: "main",
      index: true,
    },
    parents: [
      {
        type: String,
      },
    ],
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["init", "commit", "merge", "revert", "push"],
      default: "commit",
    },
    timestamp: {
      type: String,
      required: true,
    },
    files: [FileSnapshotSchema],
    changes: [FileChangeSchema],
    stats: {
      added: { type: Number, default: 0 },
      modified: { type: Number, default: 0 },
      deleted: { type: Number, default: 0 },
      additions: { type: Number, default: 0 },
      deletions: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

CommitSchema.index({ repository: 1, hash: 1 }, { unique: true });

const Commit = mongoose.model("Commit", CommitSchema);

module.exports = Commit;
