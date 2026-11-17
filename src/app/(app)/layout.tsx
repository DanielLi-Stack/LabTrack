import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Search } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { SignOut } from "@/components/sign-out";
import { AppBreadcrumb, AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <div className="app-shell">
    <aside className="app-sidebar">
      <Link href="/" className="app-brand"><span className="app-brand-mark"><Boxes size={18} strokeWidth={1.8}/></span><span>LabTrack<small className="block text-[12px] font-normal tracking-normal text-stone-400">设备与借还管理</small></span></Link>
      <AppNav role={user.role}/>
      <div className="app-sidebar-footer">
        <AppNav role={user.role} footer/>
        <Link href="/settings" className="app-profile"><span className="app-avatar">{user.name.slice(0, 1)}</span><span className="min-w-0"><strong className="block truncate text-xs text-stone-800">{user.name}</strong><small className="text-[12px] text-stone-500">{roleLabel[user.role]}</small></span></Link>
      </div>
    </aside>
    <div className="app-main">
      <header className="app-header"><AppBreadcrumb/><div className="app-header-actions"><form action="/equipment" className="app-header-search relative"><label htmlFor="global-equipment-search" className="sr-only">搜索设备</label><Search size={16} className="absolute left-2.5 top-2.5 text-stone-400"/><input id="global-equipment-search" name="q" type="search" placeholder="搜索设备..." className="pl-9"/></form><Link href="/settings" className="app-header-user text-stone-600 hover:text-stone-900">{user.name}</Link><SignOut/></div></header>
      <main className="app-content">{children}</main>
    </div>
  </div>;
}
