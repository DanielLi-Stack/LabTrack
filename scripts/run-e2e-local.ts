import { PostgresInstance } from "pg-embedded";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

async function port() { const server = createServer(); await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const value = (server.address() as { port: number }).port; await new Promise<void>(r => server.close(() => r())); return value; }
async function command(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const code = await new Promise<number>((resolve, reject) => { const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit" }); child.on("error", reject); child.on("exit", n => resolve(n ?? 1)); });
  if (code) throw new Error(`${path.basename(script)} exited with code ${code}`);
}
async function main() {
  const root = path.resolve(".test-postgres", "browser"); await mkdir(root, { recursive: true });
  const pg = new PostgresInstance({ port: 0, dataDir: path.join(root, "data"), installationDir: path.join(root, "install"), persistent: false, setupTimeout: 300 });
  let web: ChildProcess | undefined; let db: PrismaClient | undefined;
  try {
    await pg.start(); await pg.createDatabase("labtrack_e2e_test");
    const url = new URL(pg.connectionInfo.connectionString); url.pathname = "/labtrack_e2e_test";
    const webPort = await port(); const baseURL = `http://127.0.0.1:${webPort}`;
    const password = "browser-test-only-12345";
    const env = { ...process.env, DATABASE_URL: url.toString(), NEXTAUTH_URL: baseURL, NEXTAUTH_SECRET: "local-browser-test-secret-only-123456", E2E_BASE_URL: baseURL, E2E_PASSWORD: password, UPLOAD_DIR: path.join(root, "storage") };
    await command(path.resolve("node_modules/prisma/build/index.js"), ["migrate", "deploy"], env);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const passwordHash = await hash(password, 12);
    await db.userProfile.createMany({ data: [{ name: "管理员", username: "e2e_admin", role: "ADMIN", passwordHash }, { name: "成员 A", username: "e2e_a", passwordHash }, { name: "成员 B", username: "e2e_b", passwordHash }] });
    await db.equipment.create({ data: { assetCode: "EQ-E2E-SEED", name: "测试设备", category: "测试设备" } });
    web = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(webPort)], { env, stdio: "inherit" });
    let ready = false;
    for (let i = 0; i < 60; i++) { try { const response = await fetch(`${baseURL}/login`); if (response.ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("Next.js did not start");
    await command(path.resolve("node_modules/@playwright/test/cli.js"), ["test"], env);
  } finally {
    if (web) { web.kill(); await new Promise(r => setTimeout(r, 1500)); }
    if (db) await db.$disconnect();
    await pg.stop(); await pg.cleanup();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
