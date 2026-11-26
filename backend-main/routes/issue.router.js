const express = require("express");
const issueController = require("../controllers/issueController");
const { authenticateToken } = require("../middleware/authMiddleware");

const issueRouter = express.Router();

issueRouter.post(
  "/issue/create/:repoId",
  authenticateToken,
  issueController.createIssue
);
issueRouter.post("/issue/create", authenticateToken, issueController.createIssue);
issueRouter.put(
  "/issue/update/:id",
  authenticateToken,
  issueController.updateIssueById
);
issueRouter.delete(
  "/issue/delete/:id",
  authenticateToken,
  issueController.deleteIssueById
);
issueRouter.get("/issue/all/:repoId", issueController.getAllIssues);
issueRouter.get("/issue/all", issueController.getAllIssues);
issueRouter.get("/issue/:id", issueController.getIssueById);

module.exports = issueRouter;
