import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
async function main() {
  const setting = await db.systemSetting.findUnique({ where: { key: "handoverExpiryHours" } });
  const hours = typeof setting?.value === "number" ? setting.value : 168;
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const candidates = await db.handover.findMany({ where: { status: { in: ["REQUESTED", "ACCEPTED", "PENDING_APPROVAL", "READY_TO_RELEASE"] }, requestedAt: { lt: cutoff } }, select: { id: true, equipmentId: true } });
  let expired = 0;
  for (const candidate of candidates) {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM equipment WHERE id = ${candidate.equipmentId} FOR UPDATE`;
      const h = await tx.handover.findUnique({ where: { id: candidate.id } });
      if (!h || !["REQUESTED", "ACCEPTED", "PENDING_APPROVAL", "READY_TO_RELEASE"].includes(h.status) || h.requestedAt >= cutoff) return;
      await tx.handover.update({ where: { id: h.id }, data: { status: "EXPIRED", rejectionReason: "未在规定时间内完成交出" } });
      await tx.equipmentEvent.create({ data: { equipmentId: h.equipmentId, type: "handover.expired", detail: { handoverId: h.id } } });
      await tx.auditLog.create({ data: { action: "handover.expired", subjectType: "handover", subjectId: h.id, reason: `Pre-release timeout after ${hours} hours` } });
      expired++;
    });
  }
  console.log(`Expired ${expired} pre-release handovers. Released/disputed handovers were untouched.`);
}
main().finally(() => db.$disconnect());
