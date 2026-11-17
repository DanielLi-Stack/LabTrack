import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

let db: PrismaClient;
let ops: typeof import("../src/lib/operations");
const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)("PostgreSQL responsibility chain", () => {
  beforeAll(async () => {
    if (!new URL(testUrl!).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL must point to a database ending in _test");
    process.env.DATABASE_URL = testUrl;
    ({ db } = await import("../src/lib/db"));
    ops = await import("../src/lib/operations");
  });
  beforeEach(async () => {
    await db.auditLog.deleteMany(); await db.equipmentEvent.deleteMany(); await db.attachment.deleteMany();
    await db.handover.deleteMany(); await db.loan.deleteMany(); await db.equipmentAccessory.deleteMany();
    await db.equipment.deleteMany(); await db.userProfile.deleteMany(); await db.systemSetting.deleteMany();
  });
  afterAll(async () => { if (db) await db.$disconnect(); });
  async function fixture(approvalRequired = false) {
    const [a, b, manager] = await Promise.all([
      db.userProfile.create({ data: { name: "A", username: "a", passwordHash: "test-only" } }),
      db.userProfile.create({ data: { name: "B", username: "b", passwordHash: "test-only" } }),
      db.userProfile.create({ data: { name: "M", username: "manager", role: "MANAGER", passwordHash: "test-only" } })
    ]);
    const equipment = await db.equipment.create({ data: { assetCode: "EQ-TEST", name: "Test scope", category: "Test", approvalRequired } });
    const due = new Date(Date.now() + 86_400_000);
    return { a, b, manager, equipment, due };
  }
  it("allows only one concurrent checkout and keeps an audit event", async () => {
    const { a, b, equipment, due } = await fixture();
    const outcomes = await Promise.allSettled([ops.createLoan(a.id, equipment.id, "A experiment", due), ops.createLoan(b.id, equipment.id, "B experiment", due)]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "loan.checked_out" } })).toBe(1);
  });
  it("transfers responsibility atomically and is idempotent on receipt", async () => {
    const { a, b, equipment, due } = await fixture();
    const first = await ops.createLoan(a.id, equipment.id, "Project", due);
    const handover = await ops.startHandover(a.id, first.id, b.id, due, "Next experiment");
    expect((await ops.actOnHandover(b.id, handover.id, "accept")).status).toBe("READY_TO_RELEASE");
    await ops.actOnHandover(a.id, handover.id, "release");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE" } })).toBe(1);
    const completed = await ops.actOnHandover(b.id, handover.id, "receive");
    await ops.actOnHandover(b.id, handover.id, "receive");
    expect(completed.status).toBe("COMPLETED");
    expect((await db.loan.findUniqueOrThrow({ where: { id: first.id } })).closeReason).toBe("TRANSFERRED");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE", borrowerId: b.id } })).toBe(1);
    expect(await db.loan.count({ where: { equipmentId: equipment.id } })).toBe(2);
    expect((await db.handover.findUniqueOrThrow({ where: { id: handover.id } })).toLoanId).toBeTruthy();
  });
  it("requires manager approval when the equipment rule says so", async () => {
    const { a, b, manager, equipment, due } = await fixture(true);
    const request = await ops.createLoan(a.id, equipment.id, "Project", due);
    expect(request.status).toBe("REQUESTED");
    await expect(ops.checkoutApproved(a.id, request.id)).rejects.toThrow();
    await ops.decideLoan(manager.id, request.id, true);
    const loan = await ops.checkoutApproved(manager.id, request.id);
    const h = await ops.startHandover(a.id, loan.id, b.id, due);
    expect((await ops.actOnHandover(b.id, h.id, "accept")).status).toBe("PENDING_APPROVAL");
    await expect(ops.actOnHandover(b.id, h.id, "approve")).rejects.toThrow();
    await ops.actOnHandover(manager.id, h.id, "approve");
    await ops.actOnHandover(a.id, h.id, "release");
    await ops.actOnHandover(b.id, h.id, "receive");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE", borrowerId: b.id } })).toBe(1);
  });
  it("keeps return and handover mutually exclusive", async () => {
    const { a, b, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    const outcomes = await Promise.allSettled([ops.requestReturn(a.id, loan.id), ops.startHandover(a.id, loan.id, b.id, due)]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: { in: ["ACTIVE", "RETURN_PENDING"] } } })).toBe(1);
  });
  it("retains the sender after a rejection or reported dispute", async () => {
    const { a, b, manager, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    const rejected = await ops.startHandover(a.id, loan.id, b.id, due);
    await ops.actOnHandover(b.id, rejected.id, "reject", "Cannot take it");
    expect((await db.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("ACTIVE");
    const disputed = await ops.startHandover(a.id, loan.id, b.id, due);
    await ops.actOnHandover(b.id, disputed.id, "accept");
    await ops.actOnHandover(a.id, disputed.id, "release");
    await ops.actOnHandover(b.id, disputed.id, "dispute", "Missing accessory");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE", borrowerId: a.id } })).toBe(1);
    await ops.resolveDispute(manager.id, disputed.id, "returned_to_sender", "Checked physical return to A", "NORMAL");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE", borrowerId: a.id } })).toBe(1);
  });
  it("blocks inactive users and unauthorized receipt", async () => {
    const { a, b, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    const h = await ops.startHandover(a.id, loan.id, b.id, due);
    await ops.actOnHandover(b.id, h.id, "accept"); await ops.actOnHandover(a.id, h.id, "release");
    await expect(ops.actOnHandover(a.id, h.id, "receive")).rejects.toThrow();
    await db.userProfile.update({ where: { id: b.id }, data: { status: "INACTIVE" } });
    await expect(ops.actOnHandover(b.id, h.id, "receive")).rejects.toThrow();
  });
  it("audits a manager-initiated exceptional handover", async () => {
    const { a, b, manager, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    await expect(ops.startHandover(manager.id, loan.id, b.id, due)).rejects.toThrow();
    const h = await ops.startHandover(manager.id, loan.id, b.id, due, "Verified physical arrangement");
    expect(h.fromUserId).toBe(a.id);
    expect((await db.auditLog.findFirstOrThrow({ where: { subjectId: h.id } })).actorId).toBe(manager.id);
    await ops.actOnHandover(b.id, h.id, "accept");
    await expect(ops.actOnHandover(manager.id, h.id, "release")).rejects.toThrow();
    await ops.actOnHandover(a.id, h.id, "release");
  });
  it("lets a borrower cancel an uncollected request without a loan", async () => {
    const { a, equipment, due } = await fixture(true);
    const request = await ops.createLoan(a.id, equipment.id, "Project", due);
    expect((await ops.cancelLoan(a.id, request.id)).status).toBe("CANCELLED");
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE" } })).toBe(0);
  });
  it("rechecks availability after an approval before pickup", async () => {
    const { a, b, manager, equipment, due } = await fixture(true);
    const aRequest = await ops.createLoan(a.id, equipment.id, "A project", due);
    const bRequest = await ops.createLoan(b.id, equipment.id, "B project", due);
    await ops.decideLoan(manager.id, aRequest.id, true);
    await ops.decideLoan(manager.id, bRequest.id, true);
    await ops.checkoutApproved(manager.id, bRequest.id);
    await expect(ops.checkoutApproved(manager.id, aRequest.id)).rejects.toThrow();
    expect(await db.loan.count({ where: { equipmentId: equipment.id, status: "ACTIVE" } })).toBe(1);
  });
  it("prevents duplicate concurrent handover requests", async () => {
    const { a, b, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    const outcomes = await Promise.allSettled([ops.startHandover(a.id, loan.id, b.id, due), ops.startHandover(a.id, loan.id, b.id, due)]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.handover.count({ where: { equipmentId: equipment.id, status: "REQUESTED" } })).toBe(1);
  });
  it("does not make damaged returned equipment available", async () => {
    const { a, b, manager, equipment, due } = await fixture();
    const loan = await ops.createLoan(a.id, equipment.id, "Project", due);
    await ops.requestReturn(a.id, loan.id);
    await ops.receiveReturn(manager.id, loan.id, "DAMAGED", "Broken switch");
    expect((await db.loan.findUniqueOrThrow({ where: { id: loan.id } })).closeReason).toBe("RETURNED");
    await expect(ops.createLoan(b.id, equipment.id, "Next project", due)).rejects.toThrow();
  });
});
