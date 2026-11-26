const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const mainRouter = require("./routes/main.router");
const { hydrateStore } = require("./db/localDb");

function createApp() {
  const app = express();

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, ""))
    : true;

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Ensure MongoDB or Vercel Blob store is hydrated before API routes execute
  app.use(
    "/api",
    async (req, res, next) => {
      try {
        if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
          await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
          });
        } else if (
          mongoose.connection.readyState !== 1 &&
          process.env.BLOB_READ_WRITE_TOKEN
        ) {
          await hydrateStore();
        }
        next();
      } catch (err) {
        console.error("Storage initialization error:", err.message);
        res.status(500).json({ error: "Storage initialization failed" });
      }
    },
    mainRouter
  );

  // Serve built React frontend in unified Node/Docker mode
  const frontendDist = path.resolve(__dirname, "../frontend-main/dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    app.get("/", (req, res) => {
      res.json({
        name: "GitForge API",
        status: "running",
        docs: "/api/health",
      });
    });
  }

  return app;
}

module.exports = { createApp };
