import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();
async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) throw new Error("Set SEED_ADMIN_USERNAME and a SEED_ADMIN_PASSWORD of at least 12 characters.");
  const admin = await db.userProfile.upsert({
    where: { username },
    update: {},
    create: { username, name: "系统管理员", role: Role.ADMIN, passwordHash: await hash(password, 12) }
  });
  if (process.env.SEED_DEMO === "true") {
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (!demoPassword || demoPassword.length < 12) throw new Error("Set SEED_DEMO_PASSWORD (at least 12 characters).");
    const member = await db.userProfile.upsert({ where: { username: "demo_member" }, update: {}, create: { username: "demo_member", name: "演示成员", role: Role.MEMBER, passwordHash: await hash(demoPassword, 12) } });
    await db.equipment.upsert({ where: { assetCode: "EQ-0001" }, update: {}, create: { assetCode: "EQ-0001", name: "示例无人机", category: "实验设备", model: "Demo", custodianId: admin.id, storageLocation: "实验室 A", accessories: { create: [{ name: "电池", quantity: 2 }, { name: "遥控器", quantity: 1 }] } } });
    console.log(`Demo member: ${member.username}`);
  }
  console.log(`Admin ready: ${admin.username}`);
}
main().finally(() => db.$disconnect());
