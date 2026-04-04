import fs from "node:fs";
import path from "node:path";

const distPath = path.join(process.cwd(), "dist");

if (!fs.existsSync(distPath)) {
  console.log("dist directory is already clean.");
  process.exit(0);
}

try {
  fs.rmSync(distPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 150,
  });
  console.log("dist directory removed.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
    console.warn("dist directory is locked by another process. Skipping cleanup.");
    process.exit(0);
  }

  throw error;
}
