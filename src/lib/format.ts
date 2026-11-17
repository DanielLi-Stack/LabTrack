export const roleLabel = { MEMBER: "成员", MANAGER: "设备管理员", ADMIN: "系统管理员" } as const;
export const conditionLabel = { NORMAL: "正常", MAINTENANCE: "维修中", DAMAGED: "损坏", LOST: "丢失", RETIRED: "报废" } as const;
export const loanLabel = { REQUESTED: "待审批", APPROVED: "待领用", ACTIVE: "借用中", RETURN_PENDING: "待归还验收", CLOSED: "已结束", REJECTED: "已拒绝", CANCELLED: "已取消" } as const;
export const handoverLabel = { REQUESTED: "待接收人同意", ACCEPTED: "已同意", PENDING_APPROVAL: "待管理员审批", READY_TO_RELEASE: "待交出", RELEASED: "交接待接收", COMPLETED: "已完成", REJECTED: "已拒绝", CANCELLED: "已取消", EXPIRED: "已过期", DISPUTED: "交接异常" } as const;
export const ownershipLabel = { LAB: "课题组", PERSONAL: "个人", OTHER: "其他" } as const;
export function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: process.env.APP_TIME_ZONE || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function canBorrow(e: { condition: string; isBorrowable: boolean; inactiveAt: Date | null; loans: { status: string }[]; handovers: { status: string }[] }) {
  return !e.inactiveAt && e.condition === "NORMAL" && e.isBorrowable && !e.loans.some(l => ["ACTIVE", "RETURN_PENDING"].includes(l.status)) && !e.handovers.some(h => !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(h.status));
}
