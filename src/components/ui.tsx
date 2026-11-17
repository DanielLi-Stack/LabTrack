"use client";
import { useFormStatus } from "react-dom";
export function Submit({ children, danger = false, secondary = false, confirm }: { children: React.ReactNode; danger?: boolean; secondary?: boolean; confirm?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} onClick={confirm ? e => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined} className={danger ? "btn-danger" : secondary ? "btn-secondary" : "btn"}>{pending ? "正在提交…" : children}</button>;
}
