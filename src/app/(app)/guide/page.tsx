import Link from "next/link";
import { BookOpen, CalendarDays, CheckCircle2, Handshake, Package, ShieldCheck, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageTitle } from "@/components/server-ui";

const steps = [
  { number: "01", title: "找到设备", text: "在设备目录按分类、状态或借用人筛选。打开详情可查看设备信息、配件和流转记录。", href: "/equipment", label: "查看设备目录", icon: Package },
  { number: "02", title: "发起借用", text: "选择可借用设备，填写用途与预计归还时间。需要审批的设备会先交由管理员处理。", href: "/equipment?status=available", label: "查看可借设备", icon: CalendarDays },
  { number: "03", title: "归还或交接", text: "借用期间可在“我的设备”申请归还，也可发起成员间交接；接收人需确认收到设备。", href: "/my", label: "打开我的设备", icon: Handshake },
  { number: "04", title: "查看记录", text: "首页日历按设备颜色显示借用时间段。借还记录保留完整的申请、借出和归还时间。", href: "/history", label: "查看借还记录", icon: BookOpen },
];

export default async function GuidePage() {
  const user = await requireUser();
  return <><PageTitle title="新手指引" subtitle="从查找设备到完成归还，按下面的步骤使用 LabTrack。"/><div className="grid gap-3 lg:grid-cols-2">{steps.map(step => <section className="card" key={step.number}><div className="flex items-start justify-between"><span className="text-xs font-mono text-stone-400">{step.number}</span><step.icon size={19} strokeWidth={1.6} className="text-stone-500"/></div><h2 className="mt-4 text-base font-semibold text-stone-900">{step.title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-stone-600">{step.text}</p><Link href={step.href} className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-stone-900 underline underline-offset-4">{step.label} →</Link></section>)}</div>
    {user.role !== "MEMBER" && <section className="card mt-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-stone-600"/><h2 className="font-semibold">管理员操作</h2></div><p className="mt-3 text-sm leading-6 text-stone-600">设备管理员负责审批借用、确认借出和验收归还。系统管理员还可以管理成员、分配角色、设置借用规则及导出记录。</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/loans" className="btn-secondary"><CheckCircle2 size={15}/> 借还管理</Link>{user.role === "ADMIN" && <Link href="/admin/users" className="btn-secondary"><Users size={15}/> 成员与权限</Link>}</div></section>}
  </>;
}
