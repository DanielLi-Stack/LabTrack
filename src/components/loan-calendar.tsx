"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CalendarLoan = { id: string; equipmentId: string; equipmentName: string; assetCode: string; borrower: string; start: string; expectedEnd: string; actualEnd: string | null; status: string };
const zone = "Asia/Shanghai";
const dayKey = (date: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
const fullDate = (date: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: zone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
const palette = ["#8460a6", "#247b73", "#ac6a36", "#426ab0", "#ad4c69", "#667c32", "#90704d", "#3f8295", "#865d85", "#587d6d", "#a9634a", "#596e9e"];
function shift(month: string, delta: number) { const [y,m] = month.split("-").map(Number); const d = new Date(Date.UTC(y,m-1+delta,1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; }

export function LoanCalendar({ month, loans }: { month: string; loans: CalendarLoan[] }) {
  const router = useRouter();
  useEffect(() => { const timer = window.setInterval(() => router.refresh(), 60_000); return () => window.clearInterval(timer); }, [router]);
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year,number-1,1));
  const firstDay = (first.getUTCDay()+6)%7;
  const days = new Date(Date.UTC(year,number,0)).getUTCDate();
  const cells = Array.from({length: Math.ceil((firstDay+days)/7)*7},(_,i) => i-firstDay+1);
  const equipment = [...new Map(loans.map(l => [l.equipmentId,l.equipmentName] as const)).entries()];
  const colors = new Map(equipment.map(([id],i) => [id, i < palette.length ? palette[i] : `hsl(${(i * 137.508) % 360} 42% 39%)`]));
  const now = new Date().toISOString();
  return <section className="card min-w-0 p-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h2 className="section-heading">设备借用日历</h2><p className="mt-1 text-[13px] text-stone-400">借出至归还的时间段 · 每分钟更新</p></div><div className="flex items-center gap-1"><Link href={`/?month=${shift(month,-1)}`} aria-label="上个月" className="btn-secondary px-2 py-1.5"><ChevronLeft size={15}/></Link><span className="min-w-24 text-center text-sm font-semibold text-stone-800">{year} 年 {number} 月</span><Link href={`/?month=${shift(month,1)}`} aria-label="下个月" className="btn-secondary px-2 py-1.5"><ChevronRight size={15}/></Link></div></div>
    {equipment.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-stone-100 px-5 py-3">{equipment.map(([id,name]) => <span key={id} className="flex items-center gap-1.5 text-[13px] text-stone-600"><i className="h-2.5 w-2.5 rounded-sm" style={{backgroundColor:colors.get(id)}}/>{name}</span>)}</div>}
    <div className="grid grid-cols-7 border-b border-stone-100 text-center text-[13px] text-stone-500">{["周一","周二","周三","周四","周五","周六","周日"].map(day => <div key={day} className="py-2">{day}</div>)}</div>
    <div className="grid grid-cols-7">{cells.map((day,i) => { const key = `${month}-${String(day).padStart(2,"0")}`; const entries = day > 0 && day <= days ? loans.filter(l => dayKey(l.start) <= key && dayKey(l.actualEnd || (l.expectedEnd > now ? l.expectedEnd : now)) >= key) : []; return <div key={i} className={`calendar-day ${day < 1 || day > days ? "bg-stone-50/60" : ""}`}><div className={`mb-1 text-[13px] ${key === dayKey(new Date()) ? "font-bold text-stone-900" : "text-stone-500"}`}>{day > 0 && day <= days ? day : ""}</div><div className="space-y-1">{entries.slice(0,3).map(l => <Link key={l.id} href={`/equipment/${l.equipmentId}`} className="calendar-event" style={{backgroundColor:`color-mix(in srgb, ${colors.get(l.equipmentId)} 13%, white)`,color:colors.get(l.equipmentId),borderLeft:`3px solid ${colors.get(l.equipmentId)}`}} title={`${l.equipmentName} · ${l.borrower}\n借出：${fullDate(l.start)}\n预计归还：${fullDate(l.expectedEnd)}${l.actualEnd ? `\n实际归还：${fullDate(l.actualEnd)}` : ""}`}>{l.equipmentName}</Link>)}{entries.length > 3 && <div className="text-[12px] text-stone-400">另有 {entries.length-3} 件</div>}</div></div>; })}</div>
    {loans.length > 0 && <div className="border-t border-stone-100 px-5 py-4"><h3 className="mb-3 text-xs font-semibold text-stone-800">本月借用时段</h3><div className="max-h-48 space-y-2 overflow-y-auto">{loans.map(l => <Link key={l.id} href={`/equipment/${l.equipmentId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-stone-100 px-3 py-2 text-[13px] hover:bg-stone-50"><span className="h-2.5 w-2.5 flex-none rounded-sm" style={{backgroundColor:colors.get(l.equipmentId)}}/><span className="min-w-24 font-medium text-stone-800">{l.equipmentName}</span><span className="text-stone-500">{l.borrower}</span><span className="text-stone-600">借出 {fullDate(l.start)} → {l.actualEnd ? `归还 ${fullDate(l.actualEnd)}` : `预计归还 ${fullDate(l.expectedEnd)}`}</span></Link>)}</div></div>}
    {loans.length === 0 && <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-400">本月暂无已借出的设备。借出后会显示在对应日期。</p>}
  </section>;
}
