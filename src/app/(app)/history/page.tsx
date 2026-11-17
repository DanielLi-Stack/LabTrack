import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, loanLabel } from "@/lib/format";
import { Badge, PageTitle } from "@/components/server-ui";

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser(); const p = await searchParams; const page = Math.max(1, Number(p.page) || 1);
  const where = user.role === "MEMBER" ? { borrowerId: user.id } : {};
  const [rows, count] = await Promise.all([db.loan.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { equipment: true, borrower: true } }), db.loan.count({ where })]);
  return <><PageTitle title="借还记录" subtitle="保留完整的借用与结束原因"/><div className="table-wrap"><table><thead><tr><th>设备</th><th>借用人</th><th>状态</th><th>借出时间</th><th>预计归还</th><th>实际结束</th><th>结束原因</th></tr></thead><tbody>{rows.map(l => <tr key={l.id}><td><Link href={`/equipment/${l.equipmentId}`} className="font-medium text-blue-700">{l.equipment.assetCode} · {l.equipment.name}</Link></td><td>{l.borrower.name}</td><td><Badge text={loanLabel[l.status]}/></td><td>{date(l.checkedOutAt)}</td><td>{date(l.expectedReturnAt)}</td><td>{date(l.actualReturnAt)}</td><td>{({ RETURNED: "正常归还", TRANSFERRED: "成员交接", ADMIN_ADJUSTMENT: "管理员纠正" } as Record<string,string>)[l.closeReason || ""] || "—"}</td></tr>)}</tbody></table>{!rows.length && <div className="p-10 text-center text-sm text-slate-500">暂无记录</div>}</div><div className="mt-4 flex justify-between text-sm text-slate-500"><span>共 {count} 条</span><div className="flex gap-2">{page > 1 && <Link href={`/history?page=${page - 1}`} className="btn-secondary">上一页</Link>}{page * 30 < count && <Link href={`/history?page=${page + 1}`} className="btn-secondary">下一页</Link>}</div></div></>;
}
