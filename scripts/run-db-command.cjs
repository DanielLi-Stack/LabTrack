const { spawn } = require("node:child_process");
const path = require("node:path");

const env = { ...process.env, ...(process.argv[2] === "backup" ? { TEST_BACKUP: "1" } : {}) };
const child = spawn(process.execPath, ["--import", "tsx", path.join(__dirname, "run-db-tests.ts")], { cwd: path.resolve(__dirname, ".."), env, stdio: ["inherit", "pipe", "pipe"] });
let verified = false;
let tail = "";
child.stdout.on("data", chunk => {
  const value = String(chunk);
  process.stdout.write(value);
  tail = (tail + value).slice(-200);
  if (!verified && tail.includes("Database verification finished.")) {
    verified = true;
    // Some Windows PostgreSQL native handles can keep the finished child alive.
    setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1000);
  }
});
child.stderr.on("data", chunk => process.stderr.write(chunk));
child.on("error", error => { console.error(error); process.exit(1); });
child.on("exit", code => process.exit(verified ? 0 : code ?? 1));
