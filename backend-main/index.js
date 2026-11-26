#!/usr/bin/env node
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

const { createApp } = require("./app");
const { initRepo } = require("./controllers/init");
const { addRepo } = require("./controllers/add");
const { commitRepo } = require("./controllers/commit");
const { pushRepo } = require("./controllers/push");
const { pullRepo } = require("./controllers/pull");
const { revertRepo } = require("./controllers/revert");
const {
  statusRepo,
  logRepo,
  branchRepo,
  checkoutRepo,
  mergeRepo,
} = require("./controllers/cliBranch");

dotenv.config();

yargs(hideBin(process.argv))
  .command("start", "Start the GitForge API & web server", {}, startServer)
  .command("init", "Initialize a new GitForge repository", {}, () => initRepo())
  .command(
    "add <file>",
    "Stage a file or '.' for all files",
    (y) =>
      y.positional("file", {
        describe: "File path or '.' to stage all files",
        type: "string",
      }),
    (argv) => addRepo(argv.file)
  )
  .command(
    "commit <message>",
    "Commit staged files with SHA-256 hashing",
    (y) =>
      y.positional("message", {
        describe: "Commit message",
        type: "string",
      }),
    (argv) => commitRepo(argv.message)
  )
  .command("status", "Show staged and modified files", {}, () => statusRepo())
  .command("log", "Show commit history", {}, () => logRepo())
  .command(
    "branch [name]",
    "List or create a branch",
    (y) =>
      y.positional("name", {
        describe: "New branch name",
        type: "string",
      }),
    (argv) => branchRepo(argv.name)
  )
  .command(
    "checkout <branch>",
    "Switch to a branch",
    (y) =>
      y.positional("branch", {
        describe: "Target branch name",
        type: "string",
      }),
    (argv) => checkoutRepo(argv.branch)
  )
  .command(
    "merge <branch>",
    "Merge another branch into current branch with conflict detection",
    (y) =>
      y.positional("branch", {
        describe: "Source branch name",
        type: "string",
      }),
    (argv) => mergeRepo(argv.branch)
  )
  .command(
    "push [repoId]",
    "Push commits to GitForge remote (or S3/local fallback)",
    (y) =>
      y.positional("repoId", {
        describe: "Optional GitForge Repository ID",
        type: "string",
      }),
    (argv) => pushRepo(argv.repoId)
  )
  .command(
    "pull [repoId] [branch]",
    "Pull commits from GitForge remote (or S3/local fallback)",
    (y) =>
      y
        .positional("repoId", {
          describe: "Optional GitForge Repository ID",
          type: "string",
        })
        .positional("branch", {
          describe: "Optional branch name",
          type: "string",
        }),
    (argv) => pullRepo(argv.repoId, argv.branch)
  )
  .command(
    "revert <commitID>",
    "Revert working tree to a specific commit hash",
    (y) =>
      y.positional("commitID", {
        describe: "Commit hash or short prefix",
        type: "string",
      }),
    (argv) => revertRepo(argv.commitID)
  )
  .demandCommand(1, "You need at least one command")
  .help().argv;

async function connectDatabase() {
  const mongoURI =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/gitforge";
  await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 3000 });
  console.log("MongoDB connected!");
}

async function startServer() {
  const app = createApp();
  const port = process.env.PORT || 3002;

  try {
    await connectDatabase();
  } catch (err) {
    console.error("Unable to connect to MongoDB:", err.message);
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  app.set("io", io);

  io.on("connection", (socket) => {
    socket.on("joinRoom", (roomId) => {
      socket.join(roomId);
    });
  });

  httpServer.listen(port, () => {
    console.log(`GitForge server running on http://localhost:${port}`);
  });
}
