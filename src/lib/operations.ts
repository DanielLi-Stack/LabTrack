import { EquipmentCondition, HandoverStatus, LoanStatus, Prisma, Role, type UserProfile } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;
type Actor = Pick<UserProfile, "id" | "role" | "status">;
export class BusinessError extends Error { constructor(message: string) { super(message); this.name = "BusinessError"; } }
const fail = (message: string): never => { throw new BusinessError(message); };
const manager = (actor: Actor) => actor.role === Role.ADMIN || actor.role === Role.MANAGER;
const assertManager = (actor: Actor) => { if (!manager(actor)) fail("此操作需要设备管理员权限"); };
const isOpen = (status: HandoverStatus) => !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(status);

async function actorIn(tx: Tx, actorId: string) {
  const actor = await tx.userProfile.findUnique({ where: { id: actorId } });
  if (!actor || actor.status !== "ACTIVE") fail("账号已停用或登录已失效");
  return actor!;
}
async function lockEquipment(tx: Tx, equipmentId: string) {
  await tx.$queryRaw`SELECT id FROM equipment WHERE id = ${equipmentId} FOR UPDATE`;
  const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
  if (!equipment) fail("设备不存在");
  return equipment!;
}
async function openLoan(tx: Tx, equipmentId: string) {
  return tx.loan.findFirst({ where: { equipmentId, status: { in: ["ACTIVE", "RETURN_PENDING"] } } });
}
async function openHandover(tx: Tx, equipmentId: string) {
  return tx.handover.findFirst({ where: { equipmentId, status: { in: ["REQUESTED", "ACCEPTED", "PENDING_APPROVAL", "READY_TO_RELEASE", "RELEASED", "DISPUTED"] } } });
}
async function log(tx: Tx, actorId: string, action: string, equipmentId: string, subjectType: string, subjectId: string, detail?: Record<string, unknown>, reason?: string) {
  await tx.equipmentEvent.create({ data: { equipmentId, actorId, type: action, detail: (detail ?? {}) as Prisma.InputJsonValue } });
  await tx.auditLog.create({ data: { actorId, action, subjectType, subjectId, after: (detail ?? {}) as Prisma.InputJsonValue, reason } });
}
function future(value: Date) { if (Number.isNaN(value.getTime()) || value <= new Date()) fail("预计归还时间必须晚于当前时间"); }
async function withinLoanLimit(tx: Tx, value: Date) {
  const setting = await tx.systemSetting.findUnique({ where: { key: "maxLoanDays" } });
  const limit = typeof setting?.value === "number" ? setting.value : 90;
  if (value.getTime() > Date.now() + limit * 86_400_000) fail(`预计归还时间不能超过 ${limit} 天`);
}
function available(e: { condition: EquipmentCondition; isBorrowable: boolean; inactiveAt: Date | null }) {
  if (e.inactiveAt || !e.isBorrowable || e.condition !== "NORMAL") fail("设备当前不可借用");
}

export async function createLoan(actorId: string, equipmentId: string, purpose: string, expectedReturnAt: Date) {
  if (!purpose.trim()) fail("请填写借用用途"); future(expectedReturnAt);
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId);
    await withinLoanLimit(tx, expectedReturnAt);
    const e = await lockEquipment(tx, equipmentId); available(e);
    if (await openLoan(tx, equipmentId) || await openHandover(tx, equipmentId)) fail("设备状态已变化，请刷新页面");
    const status: LoanStatus = e.approvalRequired ? "REQUESTED" : "ACTIVE";
    const loan = await tx.loan.create({ data: { equipmentId, borrowerId: actor.id, purpose: purpose.trim(), expectedReturnAt, status, checkedOutAt: status === "ACTIVE" ? new Date() : null, checkedOutById: status === "ACTIVE" ? actor.id : null } });
    await log(tx, actor.id, status === "ACTIVE" ? "loan.checked_out" : "loan.requested", equipmentId, "loan", loan.id, { borrowerId: actor.id, status });
    return loan;
  });
}

export async function decideLoan(actorId: string, loanId: string, approve: boolean, reason?: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId); assertManager(actor);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("借用申请不存在");
    await lockEquipment(tx, source!.equipmentId);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "REQUESTED") fail("申请状态已变化，请刷新页面");
    const updated = await tx.loan.update({ where: { id: loanId }, data: { status: approve ? "APPROVED" : "REJECTED", approvedById: actor.id, notes: reason?.trim() || null } });
    await log(tx, actor.id, approve ? "loan.approved" : "loan.rejected", loan.equipmentId, "loan", loan.id, { status: updated.status }, reason);
    return updated;
  });
}

export async function cancelLoan(actorId: string, loanId: string, reason?: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("借用申请不存在");
    await lockEquipment(tx, source!.equipmentId);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (!["REQUESTED", "APPROVED"].includes(loan.status) || (loan.borrowerId !== actor.id && !manager(actor))) fail("当前申请不能取消");
    if (loan.borrowerId !== actor.id && !reason?.trim()) fail("管理员取消申请必须填写原因");
    const updated = await tx.loan.update({ where: { id: loanId }, data: { status: "CANCELLED", notes: reason?.trim() || "借用人取消" } });
    await log(tx, actor.id, "loan.cancelled", loan.equipmentId, "loan", loan.id, { from: loan.status }, reason);
    return updated;
  });
}

export async function checkoutApproved(actorId: string, loanId: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId); assertManager(actor);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("申请不存在");
    const e = await lockEquipment(tx, source!.equipmentId); available(e);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "APPROVED") fail("申请状态已变化，请刷新页面");
    if (await openLoan(tx, e.id) || await openHandover(tx, e.id)) fail("设备已被借用，不能完成领用");
    const updated = await tx.loan.update({ where: { id: loanId }, data: { status: "ACTIVE", checkedOutAt: new Date(), checkedOutById: actor.id } });
    await log(tx, actor.id, "loan.checked_out", e.id, "loan", loan.id, { borrowerId: loan.borrowerId });
    return updated;
  });
}

export async function requestReturn(actorId: string, loanId: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("借用记录不存在");
    await lockEquipment(tx, source!.equipmentId);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.borrowerId !== actor.id || loan.status !== "ACTIVE") fail("只有当前借用人可以申请归还");
    if (await openHandover(tx, loan.equipmentId)) fail("交接进行中，不能申请归还");
    const updated = await tx.loan.update({ where: { id: loanId }, data: { status: "RETURN_PENDING", returnRequestedAt: new Date() } });
    await log(tx, actor.id, "loan.return_requested", loan.equipmentId, "loan", loan.id);
    return updated;
  });
}

export async function receiveReturn(actorId: string, loanId: string, condition: EquipmentCondition, notes?: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId); assertManager(actor);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("借用记录不存在");
    await lockEquipment(tx, source!.equipmentId);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "RETURN_PENDING") fail("借用状态已变化，请刷新页面");
    if (await openHandover(tx, loan.equipmentId)) fail("交接进行中，不能验收归还");
    const now = new Date();
    const updated = await tx.loan.update({ where: { id: loanId }, data: { status: "CLOSED", closeReason: "RETURNED", actualReturnAt: now, receivedById: actor.id, notes: notes?.trim() || loan.notes } });
    await tx.equipment.update({ where: { id: loan.equipmentId }, data: { condition } });
    await log(tx, actor.id, "loan.returned", loan.equipmentId, "loan", loan.id, { condition, borrowerId: loan.borrowerId }, notes);
    return updated;
  });
}

export async function startHandover(actorId: string, loanId: string, toUserId: string, expectedReturnAt: Date, reason?: string, accessoriesCheck?: unknown, notes?: string, equipmentCondition: EquipmentCondition = "NORMAL") {
  future(expectedReturnAt);
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId);
    await withinLoanLimit(tx, expectedReturnAt);
    const source = await tx.loan.findUnique({ where: { id: loanId } }); if (!source) fail("借用记录不存在");
    const e = await lockEquipment(tx, source!.equipmentId); available(e);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "ACTIVE") fail("只有有效借用可以发起交接");
    const override = loan.borrowerId !== actor.id;
    if (override && (!manager(actor) || !reason?.trim())) fail("管理员代发起交接必须填写原因");
    if (toUserId === loan.borrowerId) fail("接收人不能是原借用人");
    const receiver = await tx.userProfile.findUnique({ where: { id: toUserId } });
    if (!receiver || receiver.status !== "ACTIVE") fail("接收人不存在或已停用");
    if (await openHandover(tx, e.id)) fail("此设备已有进行中的交接");
    const h = await tx.handover.create({ data: { equipmentId: e.id, fromUserId: loan.borrowerId, toUserId, fromLoanId: loan.id, expectedReturnAt, status: "REQUESTED", equipmentCondition, reason: reason?.trim() || null, notes: notes?.trim() || null, accessoriesCheck: accessoriesCheck ? (accessoriesCheck as Prisma.InputJsonValue) : Prisma.JsonNull } });
    await log(tx, actor.id, "handover.requested", e.id, "handover", h.id, { toUserId, fromLoanId: loan.id, override }, reason);
    return h;
  });
}

export type HandoverAction = "accept" | "reject" | "approve" | "deny" | "release" | "receive" | "dispute" | "cancel";
export async function actOnHandover(actorId: string, handoverId: string, action: HandoverAction, reason?: string) {
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId);
    const source = await tx.handover.findUnique({ where: { id: handoverId } }); if (!source) fail("交接记录不存在");
    const e = await lockEquipment(tx, source!.equipmentId);
    const h = await tx.handover.findUniqueOrThrow({ where: { id: handoverId } });
    if (action === "receive" && h.status === "COMPLETED" && h.toUserId === actor.id) return h;
    let status: HandoverStatus;
    const data: Prisma.HandoverUpdateInput = {};
    const now = new Date();
    switch (action) {
      case "accept":
        if (h.status !== "REQUESTED" || h.toUserId !== actor.id) fail("只有目标接收人可以同意待处理交接");
        await tx.handover.update({ where: { id: h.id }, data: { status: "ACCEPTED", acceptedAt: now } });
        await log(tx, actor.id, "handover.accepted", e.id, "handover", h.id, { from: "REQUESTED", to: "ACCEPTED" });
        status = e.approvalRequired ? "PENDING_APPROVAL" : "READY_TO_RELEASE"; data.acceptedAt = now; break;
      case "reject":
        if (h.status !== "REQUESTED" || h.toUserId !== actor.id) fail("只有目标接收人可以拒绝待处理交接");
        status = "REJECTED"; data.rejectionReason = reason?.trim() || "接收人拒绝"; break;
      case "approve":
        assertManager(actor); if (h.status !== "PENDING_APPROVAL") fail("交接不在待审批状态");
        status = "READY_TO_RELEASE"; data.approvedAt = now; break;
      case "deny":
        assertManager(actor); if (h.status !== "PENDING_APPROVAL") fail("交接不在待审批状态");
        if (!reason?.trim()) fail("拒绝时需填写原因");
        status = "REJECTED"; data.rejectionReason = reason!.trim(); break;
      case "release":
        if (h.status !== "READY_TO_RELEASE" || h.fromUserId !== actor.id) fail("只有原借用人可以确认交出");
        status = "RELEASED"; data.releasedAt = now; break;
      case "receive": {
        if (h.status !== "RELEASED" || h.toUserId !== actor.id) fail("只有目标接收人可以确认收到");
        const loan = await tx.loan.findUnique({ where: { id: h.fromLoanId } });
        if (!loan || loan.status !== "ACTIVE" || loan.borrowerId !== h.fromUserId) fail("原借用状态已变化，交接不能完成");
        await tx.loan.update({ where: { id: loan!.id }, data: { status: "CLOSED", closeReason: "TRANSFERRED", actualReturnAt: now } });
        const newLoan = await tx.loan.create({ data: { equipmentId: e.id, borrowerId: h.toUserId, purpose: `交接自 ${h.fromUserId}`, requestedAt: h.requestedAt, expectedReturnAt: h.expectedReturnAt, checkedOutAt: now, checkedOutById: actor.id, status: "ACTIVE" } });
        status = "COMPLETED"; data.toLoan = { connect: { id: newLoan.id } }; data.receivedAt = now; data.completedAt = now; if (reason?.trim()) data.notes = [h.notes, reason.trim()].filter(Boolean).join("\n");
        break;
      }
      case "dispute":
        if (h.status !== "RELEASED" || (h.toUserId !== actor.id && h.fromUserId !== actor.id)) fail("只有交接双方可以报告异常");
        if (!reason?.trim()) fail("请填写异常描述");
        status = "DISPUTED"; data.disputeReason = reason!.trim(); break;
      case "cancel":
        if (!["REQUESTED", "PENDING_APPROVAL", "READY_TO_RELEASE"].includes(h.status) || (h.fromUserId !== actor.id && !manager(actor))) fail("当前交接不能取消");
        status = "CANCELLED"; data.rejectionReason = reason?.trim() || "发起人取消"; break;
    }
    const updated = await tx.handover.update({ where: { id: h.id }, data: { ...data, status } });
    await log(tx, actor.id, action === "accept" ? (status === "PENDING_APPROVAL" ? "handover.pending_approval" : "handover.ready") : `handover.${action}`, e.id, "handover", h.id, { from: action === "accept" ? "ACCEPTED" : h.status, to: status }, reason);
    return updated;
  });
}

export type DisputeResolution = "received" | "returned_to_sender" | "returned_to_lab";
export async function resolveDispute(actorId: string, handoverId: string, resolution: DisputeResolution, reason: string, condition: EquipmentCondition) {
  if (!reason.trim()) fail("处理异常必须填写核实结果和原因");
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId); assertManager(actor);
    const source = await tx.handover.findUnique({ where: { id: handoverId } }); if (!source) fail("交接记录不存在");
    await lockEquipment(tx, source!.equipmentId);
    const h = await tx.handover.findUniqueOrThrow({ where: { id: handoverId } });
    if (h.status !== "DISPUTED") fail("交接已不在异常状态");
    const old = await tx.loan.findUnique({ where: { id: h.fromLoanId } });
    if (!old || old.status !== "ACTIVE") fail("原借用已变化，请人工核查");
    const now = new Date();
    let toLoanId: string | undefined;
    let status: HandoverStatus = "CANCELLED";
    if (resolution === "received") {
      await tx.loan.update({ where: { id: old!.id }, data: { status: "CLOSED", closeReason: "TRANSFERRED", actualReturnAt: now } });
      const newLoan = await tx.loan.create({ data: { equipmentId: h.equipmentId, borrowerId: h.toUserId, purpose: `异常交接核实：${reason.trim()}`, expectedReturnAt: h.expectedReturnAt, checkedOutAt: now, checkedOutById: actor.id, status: "ACTIVE" } });
      toLoanId = newLoan.id; status = "COMPLETED";
    } else if (resolution === "returned_to_lab") {
      await tx.loan.update({ where: { id: old!.id }, data: { status: "CLOSED", closeReason: "ADMIN_ADJUSTMENT", actualReturnAt: now, receivedById: actor.id } });
    }
    await tx.equipment.update({ where: { id: h.equipmentId }, data: { condition } });
    const updated = await tx.handover.update({ where: { id: h.id }, data: { status, toLoanId, resolvedById: actor.id, resolutionReason: reason.trim(), ...(status === "COMPLETED" ? { receivedAt: now, completedAt: now } : {}) } });
    await log(tx, actor.id, "handover.resolved", h.equipmentId, "handover", h.id, { resolution, condition, toLoanId }, reason);
    return updated;
  });
}

export async function updateEquipmentCondition(actorId: string, equipmentId: string, condition: EquipmentCondition, reason: string) {
  if (!reason.trim()) fail("请填写状态变更原因");
  return db.$transaction(async tx => {
    const actor = await actorIn(tx, actorId); assertManager(actor);
    const e = await lockEquipment(tx, equipmentId);
    const updated = await tx.equipment.update({ where: { id: e.id }, data: { condition } });
    await log(tx, actor.id, "equipment.condition_changed", e.id, "equipment", e.id, { before: e.condition, after: condition }, reason);
    return updated;
  });
}

export { isOpen };
