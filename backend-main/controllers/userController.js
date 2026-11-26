const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { User, Repository, Commit } = require("../db/models");
const { getJwtSecret } = require("../middleware/authMiddleware");

function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
}

async function signup(req, res) {
  const { username, password, email } = req.body;
  try {
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "Username, email, and password are required." });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.trim() }],
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Username or email already exists!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      repositories: [],
      followedUsers: [],
      starRepos: [],
    });

    const token = jwt.sign({ id: user._id }, getJwtSecret(), {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      userId: user._id,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Error during signup:", err.message);
    res.status(500).json({ message: "Server error during signup" });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email/username and password are required." });
    }

    const identifier = email.trim();
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    const token = jwt.sign({ id: user._id }, getJwtSecret(), {
      expiresIn: "7d",
    });

    res.json({
      token,
      userId: user._id,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Error during login:", err.message);
    res.status(500).json({ message: "Server error during login" });
  }
}

async function getAllUsers(req, res) {
  try {
    const users = await User.find({}).select("-password").lean();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function getUserProfile(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(id)
      .select("-password")
      .populate("repositories")
      .populate("starRepos");

    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    const commits = await Commit.find({ author: id })
      .select("timestamp createdAt")
      .lean();
    const countsByDate = new Map();
    for (const c of commits) {
      const dateStr = (c.timestamp || c.createdAt?.toISOString() || "").slice(
        0,
        10
      );
      if (dateStr) {
        countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + 1);
      }
    }
    const activity = Array.from(countsByDate.entries()).map(
      ([date, count]) => ({ date, count })
    );

    const result = sanitizeUser(user);
    result.totalCommits = commits.length;
    result.activity = activity;
    res.json(result);
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function updateUserProfile(req, res) {
  const { id } = req.params;
  if (String(req.userId) !== String(id)) {
    return res.status(403).json({ message: "Unauthorized profile update" });
  }

  const { email, password, bio, username } = req.body;
  try {
    const updateFields = {};
    if (email) updateFields.email = email.toLowerCase().trim();
    if (username) updateFields.username = username.trim();
    if (bio !== undefined) updateFields.bio = bio;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "User not found!" });
    }
    res.json(updated);
  } catch (err) {
    console.error("Error updating profile:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function deleteUserProfile(req, res) {
  const { id } = req.params;
  if (String(req.userId) !== String(id)) {
    return res.status(403).json({ message: "Unauthorized profile deletion" });
  }

  try {
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "User not found!" });
    }
    res.json({ message: "User Profile Deleted!" });
  } catch (err) {
    console.error("Error deleting profile:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function toggleStarRepo(req, res) {
  const { repoId } = req.params;
  const userId = req.userId;

  if (!mongoose.Types.ObjectId.isValid(repoId)) {
    return res.status(400).json({ message: "Invalid repository ID" });
  }

  try {
    const [user, repo] = await Promise.all([
      User.findById(userId),
      Repository.findById(repoId),
    ]);
    if (!user || !repo) {
      return res.status(404).json({ message: "User or repository not found" });
    }

    const alreadyStarred = user.starRepos.some(
      (id) => id.toString() === repoId
    );
    if (alreadyStarred) {
      user.starRepos = user.starRepos.filter((id) => id.toString() !== repoId);
      repo.stars = repo.stars.filter((id) => id.toString() !== userId);
    } else {
      user.starRepos.push(repo._id);
      if (!repo.stars.some((id) => id.toString() === userId)) {
        repo.stars.push(user._id);
      }
    }

    await Promise.all([user.save(), repo.save()]);
    res.json({
      starred: !alreadyStarred,
      starCount: repo.stars.length,
    });
  } catch (err) {
    console.error("Error toggling star:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

async function toggleFollowUser(req, res) {
  const { id: targetId } = req.params;
  const userId = req.userId;

  if (String(userId) === String(targetId)) {
    return res.status(400).json({ message: "Cannot follow yourself" });
  }

  try {
    const user = await User.findById(userId);
    const target = await User.findById(targetId);
    if (!user || !target) {
      return res.status(404).json({ message: "User not found" });
    }

    const following = user.followedUsers.some(
      (id) => id.toString() === targetId
    );
    if (following) {
      user.followedUsers = user.followedUsers.filter(
        (id) => id.toString() !== targetId
      );
    } else {
      user.followedUsers.push(target._id);
    }
    await user.save();
    res.json({ following: !following, followedUsers: user.followedUsers });
  } catch (err) {
    console.error("Error toggling follow:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getAllUsers,
  signup,
  login,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  toggleStarRepo,
  toggleFollowUser,
};
