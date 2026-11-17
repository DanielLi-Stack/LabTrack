import type { Prisma, Role } from "@prisma/client";
import { date, handoverLabel } from "@/lib/format";
import { Badge } from "@/components/server-ui";

type Row = Prisma.HandoverGetPayload<{ include: { fromUser: true; toUser: true } }>;
export function HandoverHistory({ rows, viewerId, role }: { rows: Row[]; viewerId: string; role: Role }) {
  return <section className="card"><h2 className="mb-4 text-lg font-bold">交接责任链</h2>{rows.length ? <div className="space-y-4">{rows.map(h => {
    const canSeePeople = role !== "MEMBER" || h.fromUserId === viewerId || h.toUserId === viewerId;
    return <div key={h.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{canSeePeople ? `${h.fromUser.name} → ${h.toUser.name}` : "成员间交接"}</div><Badge text={handoverLabel[h.status]} tone={h.status === "COMPLETED" ? "green" : h.status === "DISPUTED" ? "red" : "amber"}/></div><div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2"><div>发起：{date(h.requestedAt)}</div><div>接收人同意：{date(h.acceptedAt)}</div><div>管理员审批：{date(h.approvedAt)}</div><div>实际交出：{date(h.releasedAt)}</div><div>确认收到：{date(h.receivedAt)}</div><div>交接完成：{date(h.completedAt)}</div></div>{role !== "MEMBER" && <div className="mt-2 break-all text-xs text-slate-400">原借用 {h.fromLoanId} → 新借用 {h.toLoanId || "—"}</div>}{h.disputeReason && <p className="mt-2 text-xs text-red-700">异常：{h.disputeReason}</p>}{h.resolutionReason && <p className="mt-2 text-xs text-slate-600">处理：{h.resolutionReason}</p>}</div>;
  })}</div> : <p className="text-sm text-slate-500">暂无交接历史</p>}</section>;
}
