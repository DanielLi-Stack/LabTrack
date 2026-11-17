"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { compare, hash } from "bcryptjs";
import { EquipmentCondition, OwnershipType, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeImage } from "@/lib/storage";
import { actOnHandover, BusinessError, cancelLoan, checkoutApproved, createLoan, decideLoan, receiveReturn, requestReturn, resolveDispute, startHandover, updateEquipmentCondition, type HandoverAction, type DisputeResolution } from "@/lib/operations";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const when = (form: FormData, key: string) => new Date(`${str(form, key)}${process.env.APP_TIME_ZONE_OFFSET || "+08:00"}`);
async function user() { const u = await currentUser(); if (!u) throw new Error("请重新登录"); return u; }
function requireManager(role: Role) { if (role === "MEMBER") throw new Error("此操作需要管理员权限"); }
async function done(path: string, task: () => Promise<unknown>) {
  let message = "操作成功", error = "";
  try { await task(); revalidatePath("/", "layout"); }
  catch (e) { error = e instanceof z.ZodError ? e.issues[0]?.message || "表单无效" : e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? "资产编号、用户名或邮箱已存在" : e instanceof BusinessError ? e.message : e instanceof Error && !e.name.startsWith("Prisma") ? e.message : "操作失败，请刷新页面重试"; }
  redirect(`${path}?${error ? `error=${encodeURIComponent(error)}` : `message=${encodeURIComponent(message)}`}`);
}

const equipmentSchema = z.object({
  assetCode: z.string().min(2, "请填写资产编号").max(80), name: z.string().min(1, "请填写设备名称").max(120), category: z.string().min(1, "请填写分类").max(80),
  brand: z.string().max(80), model: z.string().max(80), serialNumber: z.string().max(100), ownerName: z.string().max(120), storageLocation: z.string().max(160), notes: z.string().max(2000),
  ownership: z.nativeEnum(OwnershipType), condition: z.nativeEnum(EquipmentCondition), custodianId: z.string(), isBorrowable: z.boolean(), approvalRequired: z.boolean(), inactive: z.boolean()
});
export async function saveEquipment(form: FormData) {
  const id = str(form, "id");
  await done(id ? `/equipment/${id}` : "/equipment", async () => {
    const actor = await user(); requireManager(actor.role);
    const value = equipmentSchema.parse({ assetCode: str(form, "assetCode"), name: str(form, "name"), category: str(form, "category"), brand: str(form, "brand"), model: str(form, "model"), serialNumber: str(form, "serialNumber"), ownerName: str(form, "ownerName"), storageLocation: str(form, "storageLocation"), notes: str(form, "notes"), ownership: str(form, "ownership") || "LAB", condition: str(form, "condition") || "NORMAL", custodianId: str(form, "custodianId"), isBorrowable: form.has("isBorrowable"), approvalRequired: form.has("approvalRequired"), inactive: form.has("inactive") });
    const accessories = str(form, "accessories").split("\n").map(line => line.trim()).filter(Boolean).map(line => { const [name, quantity] = line.split("|"); return { name: name.trim(), quantity: Number(quantity || 1) }; });
    if (accessories.some(a => !a.name || !Number.isInteger(a.quantity) || a.quantity < 1)) throw new Error("配件格式应为 名称|数量，每行一项");
    await db.$transaction(async tx => {
      const data = { assetCode: value.assetCode, name: value.name, category: value.category, brand: value.brand || null, model: value.model || null, serialNumber: value.serialNumber || null, ownerName: value.ownerName || null, storageLocation: value.storageLocation || null, notes: value.notes || null, ownership: value.ownership, condition: value.condition, custodianId: value.custodianId || null, isBorrowable: value.isBorrowable, approvalRequired: value.approvalRequired, inactiveAt: value.inactive ? new Date() : null };
      const before = id ? await tx.equipment.findUnique({ where: { id } }) : null;
      if (id && !before) throw new Error("设备不存在");
      const equipment = id ? await tx.equipment.update({ where: { id }, data }) : await tx.equipment.create({ data });
      await tx.equipmentAccessory.deleteMany({ where: { equipmentId: equipment.id } });
      if (accessories.length) await tx.equipmentAccessory.createMany({ data: accessories.map(a => ({ equipmentId: equipment.id, ...a })) });
      await tx.equipmentEvent.create({ data: { equipmentId: equipment.id, actorId: actor.id, type: id ? "equipment.updated" : "equipment.created", detail: { assetCode: value.assetCode } } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: id ? "equipment.updated" : "equipment.created", subjectType: "equipment", subjectId: equipment.id, before: before ? { assetCode: before.assetCode, condition: before.condition, isBorrowable: before.isBorrowable, inactiveAt: before.inactiveAt?.toISOString() } : Prisma.JsonNull, after: { assetCode: value.assetCode, condition: value.condition, isBorrowable: value.isBorrowable, inactive: value.inactive } } });
    });
  });
}
export async function uploadEquipmentImage(form: FormData) {
  const id = str(form, "equipmentId");
  await done(`/equipment/${id}`, async () => {
    const actor = await user(); requireManager(actor.role);
    const file = form.get("file"); if (!(file instanceof File)) throw new Error("请选择图片");
    if (!(await db.equipment.findUnique({ where: { id } }))) throw new Error("设备不存在");
    const stored = await storeImage(file);
    await db.$transaction(async tx => {
      const attachment = await tx.attachment.create({ data: { equipmentId: id, storageKey: stored.key, fileName: stored.fileName, mimeType: stored.mimeType, size: stored.size, kind: "equipment_photo", uploadedById: actor.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "equipment.photo_added", subjectType: "attachment", subjectId: attachment.id, after: { equipmentId: id } } });
    });
  });
}
export async function borrowAction(form: FormData) { const id = str(form, "equipmentId"); await done(`/equipment/${id}`, async () => createLoan((await user()).id, id, str(form, "purpose"), when(form, "expectedReturnAt"))); }
export async function loanDecisionAction(form: FormData) { await done("/admin/loans", async () => decideLoan((await user()).id, str(form, "loanId"), str(form, "decision") === "approve", str(form, "reason"))); }
export async function cancelLoanAction(form: FormData) { await done("/my", async () => cancelLoan((await user()).id, str(form, "loanId"), str(form, "reason"))); }
export async function checkoutAction(form: FormData) { await done("/admin/loans", async () => checkoutApproved((await user()).id, str(form, "loanId"))); }
export async function returnAction(form: FormData) { await done("/my", async () => requestReturn((await user()).id, str(form, "loanId"))); }
export async function receiveReturnAction(form: FormData) { await done("/admin/loans", async () => receiveReturn((await user()).id, str(form, "loanId"), z.nativeEnum(EquipmentCondition).parse(str(form, "condition")), str(form, "notes"))); }
export async function handoverStartAction(form: FormData) { await done("/handovers", async () => startHandover((await user()).id, str(form, "loanId"), str(form, "toUserId"), when(form, "expectedReturnAt"), str(form, "reason"), str(form, "accessoriesCheck") || undefined, str(form, "notes"), z.nativeEnum(EquipmentCondition).parse(str(form, "equipmentCondition") || "NORMAL"))); }
export async function handoverAction(form: FormData) { await done("/handovers", async () => { const action = z.enum(["accept", "reject", "approve", "deny", "release", "receive", "dispute", "cancel"]).parse(str(form, "action")) as HandoverAction; if (action === "receive" && (!form.has("bodyOk") || !form.has("accessoriesOk"))) throw new Error("请核对设备和配件；如有异常，请使用报告异常入口"); return actOnHandover((await user()).id, str(form, "handoverId"), action, str(form, "reason")); }); }
export async function resolveAction(form: FormData) { await done("/handovers", async () => resolveDispute((await user()).id, str(form, "handoverId"), z.enum(["received", "returned_to_sender", "returned_to_lab"]).parse(str(form, "resolution")) as DisputeResolution, str(form, "reason"), z.nativeEnum(EquipmentCondition).parse(str(form, "condition")))); }
export async function changeConditionAction(form: FormData) { const id = str(form, "equipmentId"); await done(`/equipment/${id}`, async () => updateEquipmentCondition((await user()).id, id, z.nativeEnum(EquipmentCondition).parse(str(form, "condition")), str(form, "reason"))); }

export async function saveUserAction(form: FormData) {
  await done("/admin/users", async () => {
    const actor = await user(); if (actor.role !== "ADMIN") throw new Error("只有系统管理员可以管理账号");
    const id = str(form, "id"), name = str(form, "name"), username = str(form, "username"), email = str(form, "email") || null, labGroup = str(form, "labGroup") || null;
    const role = z.nativeEnum(Role).parse(str(form, "role"));
    if (!name || !username) throw new Error("姓名和用户名不能为空");
    const status = str(form, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    const password = str(form, "password");
    if (!id && password.length < 10) throw new Error("新账号密码至少 10 位");
    if (password && password.length < 10) throw new Error("密码至少 10 位");
    if (id && id === actor.id && (status === "INACTIVE" || role !== "ADMIN")) throw new Error("不能停用或降级当前管理员账号");
    await db.$transaction(async tx => {
      const before = id ? await tx.userProfile.findUnique({ where: { id } }) : null;
      if (id && !before) throw new Error("用户不存在");
      if (id && status === "INACTIVE" && before?.status === "ACTIVE") await assertNoOpenResponsibilities(tx, id);
      const data = { name, username, email, labGroup, role, status: status as "ACTIVE" | "INACTIVE", ...(password ? { passwordHash: await hash(password, 12) } : {}) };
      const u = id ? await tx.userProfile.update({ where: { id }, data }) : await tx.userProfile.create({ data: { ...data, passwordHash: await hash(password, 12) } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: id ? "user.updated" : "user.created", subjectType: "user", subjectId: u.id, before: before ? { role: before.role, status: before.status } : Prisma.JsonNull, after: { role, status } } });
    });
  });
}
async function assertNoOpenResponsibilities(tx: Prisma.TransactionClient, id: string) {
  const [loans, handovers] = await Promise.all([
    tx.loan.count({ where: { borrowerId: id, status: { in: ["REQUESTED", "APPROVED", "ACTIVE", "RETURN_PENDING"] } } }),
    tx.handover.count({ where: { OR: [{ fromUserId: id }, { toUserId: id }], status: { in: ["REQUESTED", "ACCEPTED", "PENDING_APPROVAL", "READY_TO_RELEASE", "RELEASED", "DISPUTED"] } } }),
  ]);
  if (loans || handovers) throw new Error("该成员还有未完成的借用或交接，请先处理");
}
export async function removeUserAction(form: FormData) {
  await done("/admin/users", async () => {
    const actor = await user();
    if (actor.role !== "ADMIN") throw new Error("只有系统管理员可以移除成员");
    const id = str(form, "id");
    if (id === actor.id) throw new Error("不能移除自己的管理员账号");
    await db.$transaction(async tx => {
      const target = await tx.userProfile.findUnique({ where: { id } });
      if (!target || target.status !== "ACTIVE") throw new Error("成员不存在或已移除");
      await assertNoOpenResponsibilities(tx, id);
      await tx.userProfile.update({ where: { id }, data: { status: "INACTIVE" } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "user.removed", subjectType: "user", subjectId: id, before: { role: target.role, status: target.status }, after: { role: target.role, status: "INACTIVE" } } });
    });
  });
}
export async function saveOwnProfileAction(form: FormData) {
  await done("/settings", async () => {
    const actor = await user();
    const name = z.string().min(1, "请填写姓名").max(80).parse(str(form, "name"));
    const email = str(form, "email");
    if (email) z.string().email("邮箱格式不正确").parse(email);
    const labGroup = z.string().max(120).parse(str(form, "labGroup"));
    await db.$transaction(async tx => {
      const before = await tx.userProfile.findUniqueOrThrow({ where: { id: actor.id } });
      await tx.userProfile.update({ where: { id: actor.id }, data: { name, email: email || null, labGroup: labGroup || null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "user.profile_updated", subjectType: "user", subjectId: actor.id, before: { name: before.name, email: before.email, labGroup: before.labGroup }, after: { name, email: email || null, labGroup: labGroup || null } } });
    });
  });
}
export async function changeOwnPasswordAction(form: FormData) {
  await done("/settings", async () => {
    const actor = await user();
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");
    if (newPassword.length < 10) throw new Error("新密码至少 10 位");
    if (newPassword !== confirmation) throw new Error("两次输入的新密码不一致");
    if (currentPassword === newPassword) throw new Error("新密码不能与当前密码相同");
    await db.$transaction(async tx => {
      const profile = await tx.userProfile.findUniqueOrThrow({ where: { id: actor.id } });
      if (!(await compare(currentPassword, profile.passwordHash))) throw new Error("当前密码不正确");
      await tx.userProfile.update({ where: { id: actor.id }, data: { passwordHash: await hash(newPassword, 12) } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "user.password_changed", subjectType: "user", subjectId: actor.id } });
    });
  });
}
export async function saveSettingsAction(form: FormData) {
  await done("/admin/settings", async () => {
    const actor = await user(); if (actor.role !== "ADMIN") throw new Error("只有系统管理员可以修改规则");
    const maxLoanDays = z.coerce.number().int().min(1).max(365).parse(str(form, "maxLoanDays"));
    const handoverExpiryHours = z.coerce.number().int().min(1).max(720).parse(str(form, "handoverExpiryHours"));
    await db.$transaction(async tx => {
      const before = await tx.systemSetting.findMany();
      await tx.systemSetting.upsert({ where: { key: "maxLoanDays" }, update: { value: maxLoanDays }, create: { key: "maxLoanDays", value: maxLoanDays } });
      await tx.systemSetting.upsert({ where: { key: "handoverExpiryHours" }, update: { value: handoverExpiryHours }, create: { key: "handoverExpiryHours", value: handoverExpiryHours } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "settings.updated", subjectType: "settings", subjectId: "loan-handover", before: Object.fromEntries(before.map(x => [x.key, x.value])) as Prisma.InputJsonValue, after: { maxLoanDays, handoverExpiryHours } } });
    });
  });
}
