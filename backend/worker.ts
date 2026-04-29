import { backendConfig } from "./config";

async function main() {
  console.log(`Hustle Arena worker online in ${backendConfig.nodeEnv} mode.`);
  console.log("No production jobs are enabled yet. This process is ready for the first migrated queue.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
