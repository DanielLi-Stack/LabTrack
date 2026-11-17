import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, loanLabel } from "@/lib/format";
import { checkoutAction, handoverStartAction, loanDecisionAction, receiveReturnAction } from "@/app/actions";
import { Submit } from "@/components/ui";
import { Badge, Notice, PageTitle } from "@/components/server-ui";

export default async function AdminLoans({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role === "MEMBER") redirect("/");
  const notice = await searchParams;
  const [rows, members] = await Promise.all([
    db.loan.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { equipment: true, borrower: true } }),
    db.userProfile.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, username: true }, orderBy: { name: "asc" } })
  ]);
  return <><PageTitle title="借还管理" subtitle="审批申请、确认领用及归还验收"/><Notice message={notice.message} error={notice.error}/><div className="space-y-4">{rows.map(l => <article className="card" key={l.id}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/equipment/${l.equipmentId}`} className="font-semibold text-blue-700">{l.equipment.name}</Link><p className="mt-1 text-sm text-slate-500">{l.equipment.assetCode} · 借用人 {l.borrower.name}</p></div><Badge text={loanLabel[l.status]} tone={l.status === "RETURN_PENDING" || l.status === "REQUESTED" ? "amber" : l.status === "ACTIVE" ? "blue" : "slate"}/></div>
    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-4"><div>用途：{l.purpose}</div><div>申请：{date(l.requestedAt)}</div><div>借出：{date(l.checkedOutAt)}</div><div>预计归还：{date(l.expectedReturnAt)}</div></div>
    {l.status === "REQUESTED" && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><form action={loanDecisionAction}><input type="hidden" name="loanId" value={l.id}/><input type="hidden" name="decision" value="approve"/><Submit>批准申请</Submit></form><form action={loanDecisionAction} className="flex flex-wrap gap-2"><input type="hidden" name="loanId" value={l.id}/><input type="hidden" name="decision" value="reject"/><input name="reason" placeholder="拒绝原因" className="min-w-56"/><Submit danger>拒绝申请</Submit></form></div>}
    {l.status === "APPROVED" && <form action={checkoutAction} className="mt-4 border-t border-slate-100 pt-4"><input type="hidden" name="loanId" value={l.id}/><Submit>核实设备已领用并确认借出</Submit></form>}
    {l.status === "RETURN_PENDING" && <form action={receiveReturnAction} className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><input type="hidden" name="loanId" value={l.id}/><select name="condition" className="max-w-44"><option value="NORMAL">设备正常</option><option value="DAMAGED">设备损坏</option><option value="MAINTENANCE">需要维修</option><option value="LOST">设备丢失</option></select><input name="notes" placeholder="验收备注" className="max-w-sm"/><Submit confirm="确认设备已实际归还并完成验收？">确认归还验收</Submit></form>}
    {l.status === "ACTIVE" && <details className="mt-4 rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-sm font-medium text-blue-700">管理员代发起特殊交接</summary><p className="mt-2 text-xs text-slate-500">仅在核实实际交接安排后使用；必须填写原因，原借用人仍需确认交出。</p><form action={handoverStartAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="loanId" value={l.id}/><div><label>接收人</label><select name="toUserId" required className="mt-2"><option value="">请选择</option>{members.filter(m => m.id !== l.borrowerId).map(m => <option key={m.id} value={m.id}>{m.name} ({m.username})</option>)}</select></div><div><label>新的预计归还时间</label><input name="expectedReturnAt" type="datetime-local" required className="mt-2"/></div><div className="sm:col-span-2"><label>管理员代发起原因 *</label><input name="reason" required className="mt-2"/></div><div className="sm:col-span-2"><Submit confirm="确认代原借用人发起交接申请？">发起特殊交接</Submit></div></form></details>}
  </article>)}{!rows.length && <div className="card py-12 text-center text-sm text-slate-500">暂无借还记录</div>}</div></>;
}
