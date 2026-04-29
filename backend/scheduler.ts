import { backendConfig } from "./config";

async function main() {
  console.log(`Hustle Arena scheduler online in ${backendConfig.nodeEnv} mode.`);
  console.log("No scheduled production tasks are enabled yet. Add cleanup jobs here as flows migrate.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
