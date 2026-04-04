import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const setupSnapshotPath = path.join(root, "supabase_setup.sql");
const migrationThree = "20260404_0003_friend_requests_and_dm_notifications.sql";

const errors = [];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertNoLegacyNotificationColumns(filePath, content) {
  if (/\btype\s*,\s*[\r\n\s]*message\b/m.test(content)) {
    errors.push(
      `${path.relative(root, filePath)} still references legacy notification columns ("type", "message").`
    );
  }
}

const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

for (const file of migrationFiles) {
  assertNoLegacyNotificationColumns(path.join(migrationsDir, file), readUtf8(path.join(migrationsDir, file)));
}

const migrationThreePath = path.join(migrationsDir, migrationThree);
const migrationThreeContents = readUtf8(migrationThreePath);
if (!migrationThreeContents.includes("create or replace function public.notify_direct_message()")) {
  errors.push(`${path.relative(root, migrationThreePath)} is missing the direct-message notification trigger.`);
}

assertNoLegacyNotificationColumns(setupSnapshotPath, readUtf8(setupSnapshotPath));

if (errors.length > 0) {
  console.error("Supabase migration validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Supabase migration validation passed for ${migrationFiles.length} migration files.`);
