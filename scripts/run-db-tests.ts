import { PostgresInstance, type PgDumpFormat, type PgRestoreFormat } from "pg-embedded";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir } from "node:fs/promises";

async function command(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const exit = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit", cwd: process.cwd() });
    child.on("error", reject); child.on("exit", code => resolve(code ?? 1));
  });
  if (exit !== 0) throw new Error(`${path.basename(script)} exited with code ${exit}`);
}
async function main() {
  const root = path.resolve(".test-postgres"); await mkdir(root, { recursive: true });
  const postgres = new PostgresInstance({ port: 0, dataDir: path.join(root, "data"), installationDir: path.join(root, "install"), persistent: false, setupTimeout: 300 });
  try {
    await postgres.start();
    await postgres.createDatabase("labtrack_test");
    const probe = await postgres.executeSql("SELECT current_database(), version();", {}, "labtrack_test");
    console.log("PostgreSQL probe:", probe);
    const url = new URL(postgres.connectionInfo.connectionString); url.pathname = "/labtrack_test";
    const env = { ...process.env, DATABASE_URL: url.toString(), TEST_DATABASE_URL: url.toString() };
    await command(path.resolve("node_modules/prisma/build/index.js"), ["migrate", "deploy"], env);
    await command(path.resolve("node_modules/vitest/vitest.mjs"), ["run", "tests/integration.test.ts"], env);
    if (process.env.TEST_BACKUP === "1") {
      const backup = path.join(root, "backup.dump");
      const dump = await postgres.createDump({ file: backup, format: 1 as PgDumpFormat, noOwner: true }, "labtrack_test");
      if (dump.exitCode !== 0) throw new Error(`pg_dump failed: ${dump.stderr}`);
      await postgres.createDatabase("labtrack_restore_test");
      const restore = await postgres.createRestore({ file: backup, format: 0 as PgRestoreFormat, noOwner: true, exitOnError: true }, "labtrack_restore_test");
      if (restore.exitCode !== 0) throw new Error(`pg_restore failed: ${restore.stderr}`);
      const check = await postgres.executeSql("SELECT count(*) FROM equipment;", {}, "labtrack_restore_test");
      if (check.exitCode !== 0 || !check.stdout.includes("1 row")) throw new Error(`Restore verification failed: ${check.stderr || check.stdout}`);
      console.log("Backup and restore drill passed in a separate database.");
    }
  } finally {
    console.log("Stopping temporary PostgreSQL...");
    await postgres.stopWithTimeout(10);
    console.log("Removing temporary PostgreSQL files...");
    await postgres.cleanup();
    console.log("Temporary PostgreSQL cleanup complete.");
  }
}
main().then(() => { console.log("Database verification finished."); process.removeAllListeners("exit"); process.exit(0); }).catch(error => { console.error(error); process.removeAllListeners("exit"); process.exit(1); });
