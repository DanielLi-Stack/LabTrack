import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canBorrow, conditionLabel, date } from "@/lib/format";
import { Badge, Notice, PageTitle } from "@/components/server-ui";

type Search = {
  q?: string; category?: string; status?: string; borrower?: string;
  page?: string; message?: string; error?: string;
};

const statusOptions = [
  { value: "available", label: "可借用" },
  { value: "borrowed", label: "借用中" },
  { value: "return_pending", label: "待归还验收" },
  { value: "handover", label: "交接中" },
  { value: "abnormal", label: "设备异常" },
  { value: "unavailable", label: "不可借用" },
] as const;

export default async function EquipmentList({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const p = await searchParams;
  const query = p.q?.trim().toLowerCase() || "";
  const requestedPage = Math.max(1, Number(p.page) || 1);
  const rows = await db.equipment.findMany({
    include: {
      custodian: true,
      attachments: { where: { kind: "equipment_photo" }, orderBy: { createdAt: "desc" }, take: 1 },
      loans: { where: { status: { in: ["ACTIVE", "RETURN_PENDING"] } }, include: { borrower: true } },
      handovers: { where: { status: { in: ["REQUESTED", "PENDING_APPROVAL", "READY_TO_RELEASE", "RELEASED", "DISPUTED"] } } },
    },
    orderBy: { assetCode: "asc" },
  });
  const categories = [...new Set(rows.map(e => e.category))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const borrowers = [...new Map(rows.flatMap(e => e.loans.map(l => [l.borrowerId, l.borrower] as const))).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const filtered = rows.filter(e => {
    const loan = e.loans[0];
    const hasHandover = e.handovers.length > 0;
    const matchesStatus = !p.status || (
      p.status === "available" ? canBorrow(e) :
      p.status === "borrowed" ? !hasHandover && loan?.status === "ACTIVE" :
      p.status === "return_pending" ? !hasHandover && loan?.status === "RETURN_PENDING" :
      p.status === "handover" ? hasHandover :
      p.status === "abnormal" ? e.condition !== "NORMAL" :
      p.status === "unavailable" ? !hasHandover && !loan && e.condition === "NORMAL" && !canBorrow(e) : false
    );
    return (!query || [e.assetCode, e.name, e.category, e.brand, e.model].some(v => v?.toLowerCase().includes(query)))
      && (!p.category || e.category === p.category)
      && (!p.borrower || (p.borrower === "unassigned" ? !loan : loan?.borrowerId === p.borrower))
      && matchesStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(requestedPage, totalPages);
  const visible = filtered.slice((page - 1) * 20, page * 20);
  const params = new URLSearchParams({
    ...(p.q ? { q: p.q } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.status ? { status: p.status } : {}),
    ...(p.borrower ? { borrower: p.borrower } : {}),
  });
  const pageLink = (number: number) => `/equipment?${new URLSearchParams({ ...Object.fromEntries(params), page: String(number) })}`;

  return <>
    <PageTitle title="设备目录" subtitle="搜索资产、查看状态并发起借用" action={user.role !== "MEMBER" ? { href: "/equipment/new", label: "+ 添加设备" } : undefined}/>
    <Notice message={p.message} error={p.error}/>
    <form key={[p.q, p.category, p.status, p.borrower].join("|")} className="card mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_150px_150px_170px_148px] xl:items-end" action="/equipment">
      <div><label htmlFor="equipment-search">搜索设备</label><input id="equipment-search" name="q" defaultValue={p.q} className="mt-2" placeholder="编号、名称、品牌或型号"/></div>
      <div><label htmlFor="equipment-category">分类</label><select id="equipment-category" name="category" defaultValue={p.category || ""} className="mt-2"><option value="">全部分类</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div>
      <div><label htmlFor="equipment-status">状态</label><select id="equipment-status" name="status" defaultValue={p.status || ""} className="mt-2"><option value="">全部状态</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div><label htmlFor="equipment-borrower">借用人</label><select id="equipment-borrower" name="borrower" defaultValue={p.borrower || ""} className="mt-2"><option value="">全部借用人</option><option value="unassigned">未借出</option>{borrowers.map(borrower => <option key={borrower.id} value={borrower.id}>{borrower.name} ({borrower.username})</option>)}</select></div>
      <div className="flex gap-2 md:col-span-2 xl:col-span-1"><button className="btn flex-1">筛选</button><Link href="/equipment" className="btn-secondary">重置</Link></div>
    </form>
    <div className="table-wrap"><table><thead><tr><th>设备</th><th>资产编号</th><th>分类</th><th>当前状态</th><th>借用人</th><th>预计归还</th><th>操作</th></tr></thead><tbody>{visible.map(e => {
      const loan = e.loans[0], transfer = e.handovers[0];
      const status = transfer?.status === "RELEASED" ? "交接待接收" : transfer ? "交接中" : loan?.status === "RETURN_PENDING" ? "待归还验收" : loan ? "借用中" : e.condition !== "NORMAL" ? conditionLabel[e.condition] : canBorrow(e) ? "可借用" : "不可借用";
      return <tr key={e.id}>
        <td><div className="flex min-w-48 items-center gap-3">{e.attachments[0] ? <img src={`/api/files/${e.attachments[0].id}`} alt="" className="h-11 w-11 rounded-lg object-cover"/> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{e.name.slice(0, 1)}</div>}<div><div className="font-medium">{e.name}</div><div className="text-xs text-slate-500">{e.model || e.brand || "—"}</div></div></div></td>
        <td className="font-mono text-xs">{e.assetCode}</td><td>{e.category}</td><td><Badge text={status} tone={status === "可借用" ? "green" : transfer?.status === "RELEASED" ? "amber" : e.condition !== "NORMAL" ? "red" : "blue"}/></td><td>{loan?.borrower.name || "—"}</td><td>{date(loan?.expectedReturnAt)}</td><td><Link className="font-medium text-blue-700 hover:underline" href={`/equipment/${e.id}`}>查看详情</Link></td>
      </tr>;
    })}</tbody></table>{!visible.length && <div className="p-10 text-center text-sm text-slate-500">没有符合条件的设备</div>}</div>
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>共 {filtered.length} 件 · 第 {page} / {totalPages} 页</span><div className="flex gap-2">{page > 1 && <Link className="btn-secondary" href={pageLink(page - 1)}>上一页</Link>}{page < totalPages && <Link className="btn-secondary" href={pageLink(page + 1)}>下一页</Link>}</div></div>
  </>;
}
