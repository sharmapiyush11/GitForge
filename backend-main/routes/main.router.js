const express = require("express");
const { isMongoConnected } = require("../db/models");
const userRouter = require("./user.router");
const repoRouter = require("./repo.router");
const issueRouter = require("./issue.router");

const mainRouter = express.Router();

mainRouter.get("/health", (req, res) => {
  const storage = isMongoConnected()
    ? "mongodb"
    : process.env.BLOB_READ_WRITE_TOKEN
    ? "vercel-blob"
    : "local-json";

  res.json({
    status: "ok",
    service: "GitForge VCS API",
    storage,
    timestamp: new Date().toISOString(),
  });
});

mainRouter.use(userRouter);
mainRouter.use(repoRouter);
mainRouter.use(issueRouter);

module.exports = mainRouter;
