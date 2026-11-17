import Link from "next/link";
export function Notice({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return <div role="alert" className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</div>;
}
export function Badge({ text, tone = "slate" }: { text: string; tone?: "slate" | "blue" | "green" | "amber" | "red" }) {
  const style = { slate: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" }[tone];
  return <span className={`inline-flex flex-none self-start whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{text}</span>;
}
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: { href: string; label: string } }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>{action && <Link className="btn" href={action.href}>{action.label}</Link>}</div>;
}
export function Empty({ text }: { text: string }) { return <div className="card py-12 text-center text-sm text-slate-500">{text}</div>; }
