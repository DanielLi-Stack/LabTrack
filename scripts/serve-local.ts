import { PostgresInstance } from "pg-embedded";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const baseURL = "http://127.0.0.1:3000";
const localDir = path.resolve(".local-postgres");
const prismaCLI = path.resolve("node_modules/prisma/build/index.js");
const nextCLI = path.resolve("node_modules/next/dist/bin/next");

async function run(script: string, args: string[], env: NodeJS.ProcessEnv) {
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", value => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`${path.basename(script)} exited with code ${code}`);
}

async function main() {
  await mkdir(localDir, { recursive: true });
  const passwordFile = path.join(localDir, "password");
  let databasePassword: string;
  try { databasePassword = (await readFile(passwordFile, "utf8")).trim(); }
  catch {
    databasePassword = randomBytes(24).toString("base64url");
    await writeFile(passwordFile, databasePassword, { flag: "wx" });
  }
  const pg = new PostgresInstance({
    port: 55432,
    password: databasePassword,
    dataDir: path.join(localDir, "data"),
    installationDir: path.join(localDir, "install"),
    persistent: true,
    setupTimeout: 300,
  });
  let db: PrismaClient | undefined;
  let web: ChildProcess | undefined;

  try {
    await pg.start();
    if (!(await pg.databaseExists("labtrack"))) await pg.createDatabase("labtrack");
    const databaseURL = new URL(pg.connectionInfo.connectionString);
    databaseURL.pathname = "/labtrack";
    const env = {
      ...process.env,
      DATABASE_URL: databaseURL.toString(),
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex"),
      UPLOAD_DIR: path.join(localDir, "storage"),
    };

    await run(prismaCLI, ["migrate", "deploy"], env);
    db = new PrismaClient({ datasources: { db: { url: databaseURL.toString() } } });
    if ((await db.userProfile.count({ where: { role: "ADMIN" } })) === 0) {
      const username = "admin";
      const password = randomBytes(18).toString("base64url");
      await db.userProfile.create({ data: {
        name: "管理员",
        username,
        passwordHash: await hash(password, 12),
        role: "ADMIN",
      } });
      console.log(`初始管理员账号：${username}`);
      console.log(`初始管理员密码：${password}`);
    }

    web = spawn(process.execPath, [nextCLI, "dev", "-H", "127.0.0.1", "-p", "3000"], { env, stdio: "inherit" });
    const webExit = new Promise<void>((resolve, reject) => {
      web!.on("error", reject);
      web!.on("exit", code => code === 0 ? resolve() : reject(new Error(`Web server exited with code ${code}`)));
    });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(`${baseURL}/login`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error("Web server did not become ready");
    console.log(`LabTrack 已启动：${baseURL}/login`);
    await webExit;
  } finally {
    if (web && web.exitCode === null) web.kill();
    await db?.$disconnect();
    await pg.stop();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
