import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { cancelLoanAction } from "@/app/actions";
import { Submit } from "@/components/ui";
import { Badge } from "@/components/server-ui";
import { date, loanLabel } from "@/lib/format";

type LoanRow = Prisma.LoanGetPayload<{ include: { equipment: true } }>;
export function PendingLoans({ rows }: { rows: LoanRow[] }) {
  const pending = rows.filter(l => l.status === "REQUESTED" || l.status === "APPROVED");
  if (!pending.length) return null;
  return <section className="mb-8"><h2 className="mb-4 text-lg font-bold">借用申请</h2><div className="grid gap-4 xl:grid-cols-2">{pending.map(l => <div className="card" key={l.id}><div className="flex items-start justify-between gap-2"><Link className="font-semibold text-blue-700" href={`/equipment/${l.equipmentId}`}>{l.equipment.name}</Link><Badge text={loanLabel[l.status]} tone="amber"/></div><p className="mt-2 text-sm text-slate-500">申请 {date(l.requestedAt)} · 预计归还 {date(l.expectedReturnAt)}</p><form action={cancelLoanAction} className="mt-4"><input type="hidden" name="loanId" value={l.id}/><Submit secondary confirm="确认取消这条借用申请？">取消申请</Submit></form></div>)}</div></section>;
}
