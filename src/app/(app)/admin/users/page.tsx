import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, roleLabel } from "@/lib/format";
import { removeUserAction, saveUserAction } from "@/app/actions";
import { Submit } from "@/components/ui";
import { Badge, Notice, PageTitle } from "@/components/server-ui";

type ListedUser = { id: string; name: string; username: string; email: string | null; labGroup: string | null; role: "MEMBER" | "MANAGER" | "ADMIN"; status: "ACTIVE" | "INACTIVE"; createdAt: Date };
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") redirect("/");
  const notice = await searchParams;
  const users = await db.userProfile.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }] });
  const active = users.filter(u => u.status === "ACTIVE"), removed = users.filter(u => u.status === "INACTIVE");
  return <><PageTitle title="成员与权限" subtitle="创建成员账号、分配角色和移除成员。"/><Notice message={notice.message} error={notice.error}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{[["成员","查看设备、申请借用、归还与交接"],["设备管理员","管理设备、审批借还和处理交接"],["系统管理员","拥有全部权限，并管理成员与规则"]].map(([role,description]) => <div key={role} className="card p-4"><strong className="text-sm">{role}</strong><p className="mt-1 text-xs leading-5 text-stone-500">{description}</p></div>)}</div>
    <details className="card mb-5"><summary className="cursor-pointer text-sm font-semibold text-stone-900">＋ 新增成员</summary><UserForm/></details>
    <h2 className="section-heading mb-3">在用成员 · {active.length}</h2><div className="space-y-2">{active.map(u => <UserRow key={u.id} user={u} actorId={actor.id}/>)}</div>
    {removed.length > 0 && <details className="mt-7"><summary className="section-heading cursor-pointer">已移除成员 · {removed.length}（可恢复）</summary><div className="mt-3 space-y-2">{removed.map(u => <UserRow key={u.id} user={u} actorId={actor.id}/>)}</div></details>}
  </>;
}
function UserRow({ user, actorId }: { user: ListedUser; actorId: string }) {
  return <details className="card" key={user.id}><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><div><span className="font-semibold">{user.name}</span><span className="ml-2 text-xs text-stone-500">@{user.username}</span><span className="ml-3 text-xs text-stone-400">创建于 {date(user.createdAt)}</span></div><div className="flex gap-2"><Badge text={roleLabel[user.role]} tone="slate"/><Badge text={user.status === "ACTIVE" ? "在用" : "已移除"} tone={user.status === "ACTIVE" ? "green" : "red"}/></div></summary><UserForm user={user}/>{user.status === "ACTIVE" && user.id !== actorId && <form action={removeUserAction} className="mt-4 border-t border-stone-100 pt-4"><input type="hidden" name="id" value={user.id}/><p className="mb-3 text-xs text-stone-500">移除后无法登录；借还与审计历史会保留。如有未完成借用，需先处理。</p><Submit danger confirm={`确认移除成员「${user.name}」？`}>移除成员</Submit></form>}</details>;
}
function UserForm({ user }: { user?: ListedUser }) {
  return <form action={saveUserAction} className="mt-5 grid gap-4 border-t border-stone-100 pt-5 md:grid-cols-2"><input type="hidden" name="id" value={user?.id || ""}/><div><label>姓名 *</label><input name="name" defaultValue={user?.name} required className="mt-2"/></div><div><label>登录名 *</label><input name="username" defaultValue={user?.username} required className="mt-2"/></div><div><label>邮箱</label><input name="email" type="email" defaultValue={user?.email || ""} className="mt-2"/></div><div><label>所属课题组</label><input name="labGroup" defaultValue={user?.labGroup || ""} className="mt-2"/></div><div><label>{user ? "重置密码（留空则不变）" : "初始密码（至少 10 位）*"}</label><input name="password" type="password" minLength={10} required={!user} autoComplete="new-password" className="mt-2"/></div><div><label>角色</label><select name="role" defaultValue={user?.role || "MEMBER"} className="mt-2"><option value="MEMBER">成员</option><option value="MANAGER">设备管理员</option><option value="ADMIN">系统管理员</option></select></div><div><label>账号状态</label><select name="status" defaultValue={user?.status || "ACTIVE"} className="mt-2"><option value="ACTIVE">在用</option><option value="INACTIVE">已移除（可恢复）</option></select></div><div className="flex items-end"><Submit>{user ? "保存成员信息" : "创建成员"}</Submit></div></form>;
}
