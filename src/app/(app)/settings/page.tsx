import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/format";
import { changeOwnPasswordAction, saveOwnProfileAction } from "@/app/actions";
import { Submit } from "@/components/ui";
import { Notice, PageTitle } from "@/components/server-ui";

export default async function PersonalSettings({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const actor = await requireUser();
  const profile = await db.userProfile.findUniqueOrThrow({ where: { id: actor.id } });
  const notice = await searchParams;
  return <>
    <PageTitle title="个人设置" subtitle="查看账号信息，更新联系资料和登录密码。"/>
    <Notice message={notice.message} error={notice.error}/>
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <section className="card"><h2 className="text-base font-semibold text-stone-900">基本资料</h2><p className="mt-1 text-xs text-stone-500">登录名与角色由系统管理员分配。</p>
        <form action={saveOwnProfileAction} className="mt-5 space-y-4">
          <div><label htmlFor="profile-username">登录名</label><input id="profile-username" value={profile.username} readOnly className="mt-2 bg-stone-50 text-stone-500"/></div>
          <div><label htmlFor="profile-role">当前角色</label><input id="profile-role" value={roleLabel[profile.role]} readOnly className="mt-2 bg-stone-50 text-stone-500"/></div>
          <div><label htmlFor="profile-name">姓名 *</label><input id="profile-name" name="name" defaultValue={profile.name} required maxLength={80} className="mt-2"/></div>
          <div><label htmlFor="profile-email">邮箱</label><input id="profile-email" name="email" type="email" defaultValue={profile.email || ""} className="mt-2"/></div>
          <div><label htmlFor="profile-lab">所属课题组</label><input id="profile-lab" name="labGroup" defaultValue={profile.labGroup || ""} maxLength={120} className="mt-2"/></div>
          <Submit>保存资料</Submit>
        </form>
      </section>
      <section className="card"><h2 className="text-base font-semibold text-stone-900">修改密码</h2><p className="mt-1 text-xs text-stone-500">请输入当前密码，新密码至少 10 位。</p>
        <form action={changeOwnPasswordAction} className="mt-5 space-y-4">
          <div><label htmlFor="current-password">当前密码</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required className="mt-2"/></div>
          <div><label htmlFor="new-password">新密码</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={10} required className="mt-2"/></div>
          <div><label htmlFor="confirm-password">确认新密码</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required className="mt-2"/></div>
          <Submit>更新密码</Submit>
        </form>
      </section>
    </div>
  </>;
}
