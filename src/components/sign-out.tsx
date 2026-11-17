"use client";
import { signOut } from "next-auth/react";
export function SignOut() { return <button className="flex-none whitespace-nowrap text-sm text-stone-500 hover:text-stone-900" onClick={() => signOut({ callbackUrl: "/login" })}>退出登录</button>; }
