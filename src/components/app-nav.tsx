"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardList, Handshake, LayoutDashboard, Package, Settings, ShieldCheck, Users } from "lucide-react";

export function AppBreadcrumb() {
  const path = usePathname();
  const label = path === "/" ? "概览" : path.startsWith("/equipment") ? "设备目录" : path === "/my" ? "我的设备" : path === "/handovers" ? "设备交接" : path === "/history" ? "借还记录" : path === "/admin/loans" ? "借还管理" : path === "/admin/users" ? "成员与权限" : path === "/admin/settings" ? "系统设置" : path === "/settings" ? "个人设置" : path === "/guide" ? "新手指引" : "工作台";
  return <div><span className="text-stone-400">工作台</span><span className="mx-2 text-stone-300">›</span><span className="font-medium text-stone-800">{label}</span></div>;
}

export function AppNav({ role, footer = false }: { role: "MEMBER" | "MANAGER" | "ADMIN"; footer?: boolean }) {
  const path = usePathname();
  const main = [
    { href: "/", label: "概览", icon: LayoutDashboard },
    { href: "/equipment", label: "设备目录", icon: Package },
    { href: "/my", label: "我的设备", icon: ClipboardList },
    { href: "/handovers", label: "设备交接", icon: Handshake },
    { href: "/history", label: "借还记录", icon: CalendarDays },
  ];
  const manage = [
    ...(role !== "MEMBER" ? [{ href: "/admin/loans", label: "借还管理", icon: ShieldCheck }] : []),
    ...(role === "ADMIN" ? [{ href: "/admin/users", label: "成员与权限", icon: Users }] : []),
  ];
  const settings = [
    { href: "/guide", label: "新手指引", icon: BookOpen },
    { href: "/settings", label: "个人设置", icon: Settings },
    ...(role !== "MEMBER" ? [{ href: "/admin/settings", label: "系统设置", icon: Settings }] : []),
  ];
  const links = (items: typeof main) => items.map(item => <Link key={item.href} href={item.href} className="nav-link" aria-current={path === item.href || (item.href === "/equipment" && path.startsWith("/equipment/")) ? "page" : undefined}><item.icon size={15} strokeWidth={1.8}/>{item.label}</Link>);
  return <nav aria-label={footer ? "帮助与设置" : "主导航"}>{footer ? <><p className="nav-heading">设置</p>{links(settings)}</> : <><p className="nav-heading">主菜单</p>{links(main)}{manage.length > 0 && <><p className="nav-heading mt-4 border-t border-stone-200">管理</p>{links(manage)}</>}</>}</nav>;
}
