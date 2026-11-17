import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { saveSettingsAction } from "@/app/actions";
import { Submit } from "@/components/ui";
import { Notice, PageTitle } from "@/components/server-ui";

export default async function Settings({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const user = await requireUser(); if (user.role === "MEMBER") redirect("/"); const notice = await searchParams;
  const [settings, logs] = await Promise.all([db.systemSetting.findMany(), user.role === "ADMIN" ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { actor: true } }) : Promise.resolve([])]);
  const maxLoanDays = Number(settings.find(s => s.key === "maxLoanDays")?.value ?? 90);
  const handoverExpiryHours = Number(settings.find(s => s.key === "handoverExpiryHours")?.value ?? 168);
  return <><PageTitle title="系统设置与数据" subtitle="管理借用规则、导出记录并查看审计日志"/><Notice message={notice.message} error={notice.error}/><div className="grid gap-6 xl:grid-cols-2"><section className="card"><h2 className="mb-4 text-lg font-bold">借用与交接规则</h2><form action={saveSettingsAction} className="space-y-4"><div><label>最长借用天数</label><input name="maxLoanDays" type="number" min={1} max={365} defaultValue={maxLoanDays} disabled={user.role !== "ADMIN"} className="mt-2"/><p className="mt-1 text-xs text-slate-500">超出此期限的借用和交接申请将被拒绝。</p></div><div><label>交接过期小时数</label><input name="handoverExpiryHours" type="number" min={1} max={720} defaultValue={handoverExpiryHours} disabled={user.role !== "ADMIN"} className="mt-2"/><p className="mt-1 text-xs text-slate-500">仅在设备实际交出前可过期；需配置定时运行过期脚本。</p></div>{user.role === "ADMIN" && <Submit>保存规则</Submit>}</form></section><section className="card"><h2 className="mb-4 text-lg font-bold">CSV 数据导出</h2><p className="mb-4 text-sm text-slate-500">文件带 UTF-8 BOM，支持中文表格软件直接打开。</p><div className="grid gap-2 sm:grid-cols-2">{[{ kind: "equipment", label: "设备台账" }, { kind: "current-loans", label: "当前借用" }, { kind: "loans", label: "借还历史" }, { kind: "handovers", label: "交接记录" }].map(x => <Link key={x.kind} className="btn-secondary" href={`/api/export/${x.kind}`}>{x.label} ↓</Link>)}</div></section></div>{user.role === "ADMIN" && <section className="mt-6"><h2 className="mb-4 text-lg font-bold">最近审计日志</h2><div className="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>原因</th></tr></thead><tbody>{logs.map(l => <tr key={l.id}><td>{date(l.createdAt)}</td><td>{l.actor?.name || "系统"}</td><td>{l.action}</td><td>{l.subjectType} / {l.subjectId.slice(0, 10)}</td><td>{l.reason || "—"}</td></tr>)}</tbody></table>{!logs.length && <div className="p-8 text-center text-sm text-slate-500">暂无审计记录</div>}</div></section>}</>;
}
