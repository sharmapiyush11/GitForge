const express = require("express");
const userController = require("../controllers/userController");
const { authenticateToken } = require("../middleware/authMiddleware");

const userRouter = express.Router();

userRouter.get("/allUsers", userController.getAllUsers);
userRouter.post("/signup", userController.signup);
userRouter.post("/login", userController.login);
userRouter.get("/userProfile/:id", userController.getUserProfile);
userRouter.put(
  "/updateProfile/:id",
  authenticateToken,
  userController.updateUserProfile
);
userRouter.delete(
  "/deleteProfile/:id",
  authenticateToken,
  userController.deleteUserProfile
);
userRouter.post(
  "/star/:repoId",
  authenticateToken,
  userController.toggleStarRepo
);
userRouter.post(
  "/follow/:id",
  authenticateToken,
  userController.toggleFollowUser
);

module.exports = userRouter;
