const buffer = require("buffer");
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}

const { createApp } = require("../backend-main/app");

const app = createApp();

module.exports = app;
