import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

function csv(rows: (string | number | null | undefined)[][]) {
  return "\uFEFF" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await currentUser(); if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.role === "MEMBER") return new NextResponse("Forbidden", { status: 403 });
  const { kind } = await context.params;
  let rows: (string | number | null | undefined)[][];
  if (kind === "equipment") {
    const data = await db.equipment.findMany({ include: { custodian: true, accessories: true }, orderBy: { assetCode: "asc" } });
    rows = [["资产编号", "名称", "分类", "品牌", "型号", "序列号", "归属", "所有者", "保管人", "位置", "健康状态", "可借用", "审批", "配件", "停用时间"], ...data.map(e => [e.assetCode, e.name, e.category, e.brand, e.model, e.serialNumber, e.ownership, e.ownerName, e.custodian?.name, e.storageLocation, e.condition, e.isBorrowable ? "是" : "否", e.approvalRequired ? "是" : "否", e.accessories.map(a => `${a.name}×${a.quantity}`).join(";"), e.inactiveAt?.toISOString()])];
  } else if (kind === "loans" || kind === "current-loans") {
    const data = await db.loan.findMany({ where: kind === "current-loans" ? { status: { in: ["ACTIVE", "RETURN_PENDING"] } } : {}, include: { equipment: true, borrower: true }, orderBy: { createdAt: "desc" } });
    rows = [["借用编号", "资产编号", "设备", "借用人", "用途", "状态", "申请时间UTC", "借出时间UTC", "预计归还UTC", "实际结束UTC", "结束原因"], ...data.map(l => [l.id, l.equipment.assetCode, l.equipment.name, l.borrower.name, l.purpose, l.status, l.requestedAt.toISOString(), l.checkedOutAt?.toISOString(), l.expectedReturnAt.toISOString(), l.actualReturnAt?.toISOString(), l.closeReason])];
  } else if (kind === "handovers") {
    const data = await db.handover.findMany({ include: { equipment: true, fromUser: true, toUser: true }, orderBy: { requestedAt: "desc" } });
    rows = [["交接编号", "资产编号", "设备", "原借用人", "接收人", "状态", "原借用编号", "新借用编号", "发起UTC", "同意UTC", "审批UTC", "交出UTC", "接收UTC", "完成UTC", "异常", "处理结果"], ...data.map(h => [h.id, h.equipment.assetCode, h.equipment.name, h.fromUser.name, h.toUser.name, h.status, h.fromLoanId, h.toLoanId, h.requestedAt.toISOString(), h.acceptedAt?.toISOString(), h.approvedAt?.toISOString(), h.releasedAt?.toISOString(), h.receivedAt?.toISOString(), h.completedAt?.toISOString(), h.disputeReason, h.resolutionReason])];
  } else return new NextResponse("Not found", { status: 404 });
  return new NextResponse(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="labtrack-${kind}-${new Date().toISOString().slice(0,10)}.csv"`, "Cache-Control": "no-store" } });
}
