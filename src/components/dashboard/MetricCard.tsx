import type { LucideIcon } from "lucide-react";
import { formatMoney } from "../../calculations/money";
export function MetricCard({
  label,
  icon: Icon,
  description,
  amountCents,
  tone = 0,
}: {
  label: string;
  icon: LucideIcon;
  description: string;
  amountCents?: number;
  tone?: number;
}) {
  return (
    <section className="metric-card">
      <div className="metric-label">
        {label}
        <span className={`metric-icon tone-${tone}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">
        {amountCents === undefined ? "—" : formatMoney(amountCents)}
        <span>CAD</span>
      </div>
      <p>{description}</p>
      <div className="metric-status">
        <span className="neutral-dot" />
        {amountCents === undefined
          ? "Awaiting financial setup"
          : "From your financial records"}
      </div>
    </section>
  );
}
