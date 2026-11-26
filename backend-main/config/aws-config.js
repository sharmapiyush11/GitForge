const AWS = require("aws-sdk");

const region = process.env.AWS_REGION || "ap-south-1";
AWS.config.update({ region });

const s3 = new AWS.S3();
const S3_BUCKET = process.env.S3_BUCKET || "";

function isS3Configured() {
  return Boolean(
    S3_BUCKET &&
      S3_BUCKET !== "insert_bucket_name" &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

module.exports = { s3, S3_BUCKET, isS3Configured };
