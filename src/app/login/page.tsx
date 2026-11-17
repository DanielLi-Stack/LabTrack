"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Boxes, LockKeyhole } from "lucide-react";
export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function submit(form: FormData) {
    setPending(true); setError("");
    const result = await signIn("credentials", { username: String(form.get("username") || ""), password: String(form.get("password") || ""), redirect: false });
    if (result?.error) { setError("用户名或密码错误，或账号已停用"); setPending(false); return; }
    router.replace("/"); router.refresh();
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#e7e6e4] p-6"><div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-lg shadow-stone-300/30"><div className="mb-8 flex items-center gap-3"><div className="rounded-lg border border-stone-200 bg-white p-3 text-stone-900"><Boxes size={24}/></div><div><div className="text-2xl font-bold">LabTrack</div><div className="text-sm text-slate-500">课题组设备资产与借还管理</div></div></div><form action={submit} className="space-y-5"><div><label htmlFor="username">用户名</label><input id="username" name="username" autoComplete="username" required className="mt-2" /></div><div><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" required className="mt-2" /></div>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={pending} className="btn w-full"><LockKeyhole size={16}/>{pending ? "登录中…" : "登录"}</button></form><p className="mt-7 text-center text-xs text-slate-400">账户由课题组管理员创建</p></div></main>;
}


