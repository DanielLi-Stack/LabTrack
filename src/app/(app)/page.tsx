import Link from "next/link";
import { ArrowUpRight, CalendarDays, CircleCheck, Clock3, Package } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canBorrow, date, loanLabel } from "@/lib/format";
import { Badge } from "@/components/server-ui";
import { LoanCalendar } from "@/components/loan-calendar";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const requested = (await searchParams).month;
  const now = new Date();
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIME_ZONE || "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const rangeStart = new Date(Date.UTC(year, monthNumber - 1, 1) - 24 * 3600_000);
  const rangeEnd = new Date(Date.UTC(year, monthNumber + 1, 1));
  const [equipment, recentLoans, calendarLoans] = await Promise.all([
    db.equipment.findMany({ include: { loans: { where: { status: { in: ["ACTIVE", "RETURN_PENDING"] } } }, handovers: { where: { status: { in: ["REQUESTED", "PENDING_APPROVAL", "READY_TO_RELEASE", "RELEASED", "DISPUTED"] } } } } }),
    db.loan.findMany({ where: user.role === "MEMBER" ? { borrowerId: user.id } : {}, orderBy: { createdAt: "desc" }, take: 6, include: { equipment: true, borrower: true } }),
    db.loan.findMany({ where: { checkedOutAt: { not: null, lte: rangeEnd }, OR: [{ actualReturnAt: null }, { actualReturnAt: { gte: rangeStart } }] }, orderBy: { checkedOutAt: "asc" }, include: { equipment: true, borrower: true } }),
  ]);
  const active = equipment.filter(e => e.loans.length > 0).length;
  const overdue = equipment.filter(e => e.loans.some(l => l.expectedReturnAt < now)).length;
  const stats = [
    { label: "设备总数", value: equipment.length, icon: Package, href: "/equipment" },
    { label: "当前可借", value: equipment.filter(canBorrow).length, icon: CircleCheck, href: "/equipment?status=available" },
    { label: "借用中", value: active, icon: CalendarDays, href: "/equipment?status=borrowed" },
    { label: "逾期未还", value: overdue, icon: Clock3, href: "/admin/loans" },
  ];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">工作台 / 概览</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">设备概览</h1><p className="mt-1 text-xs text-stone-500">借用安排与设备动态</p></div><Link href="/api/export/current-loans" className="btn-secondary text-xs">导出当前借用 <ArrowUpRight size={14}/></Link></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map(stat => <Link href={stat.href} key={stat.label} className="card group block p-4 hover:border-stone-300"><div className="flex items-start justify-between"><span className="eyebrow">{stat.label}</span><stat.icon size={17} strokeWidth={1.6} className="text-stone-400"/></div><div className="metric-value">{stat.value}<span className="ml-2 text-xs font-normal tracking-normal text-stone-400">件</span></div></Link>)}</div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(270px,0.85fr)]"><LoanCalendar month={month} loans={calendarLoans.map(l => ({ id: l.id, equipmentId: l.equipmentId, equipmentName: l.equipment.name, assetCode: l.equipment.assetCode, borrower: l.borrower.name, start: l.checkedOutAt!.toISOString(), expectedEnd: l.expectedReturnAt.toISOString(), actualEnd: l.actualReturnAt?.toISOString() || null, status: l.status }))}/><section className="card"><div className="mb-4 flex items-center justify-between"><h2 className="section-heading">近期借用</h2><Link href="/history" className="text-xs text-stone-500 hover:text-stone-900">查看全部 →</Link></div>{recentLoans.length ? <div className="space-y-0">{recentLoans.map(l => <div key={l.id} className="flex gap-3 border-b border-stone-100 py-3 first:pt-0 last:border-0"><div className="grid h-8 w-8 flex-none place-items-center rounded-md bg-stone-100 text-xs font-semibold text-stone-600">{l.equipment.name.slice(0,1)}</div><div className="min-w-0 flex-1"><Link href={`/equipment/${l.equipmentId}`} className="block truncate text-sm font-medium text-stone-900 hover:underline">{l.equipment.name}</Link><p className="mt-1 text-[13px] text-stone-500">{l.borrower.name} · {date(l.checkedOutAt || l.requestedAt)}</p></div><Badge text={loanLabel[l.status]} tone={l.status === "ACTIVE" ? "green" : l.status === "RETURN_PENDING" ? "amber" : "slate"}/></div>)}</div> : <p className="py-10 text-center text-xs text-stone-400">暂无借用记录</p>}</section></div>
  </div>;
}
