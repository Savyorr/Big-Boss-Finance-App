import { lazy, Suspense } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Panel } from "../ui/shared";
const FinancialChart = lazy(() => import("./FinancialChart"));
export interface ChartPoint {
  period: string;
  revenue: number;
  expenses: number;
  profit?: number;
  cash?: number;
}
export function ChartPanel({
  title,
  subtitle,
  data = [],
  compact = false,
  mode = "revenue",
  provisional = false,
}: {
  title: string;
  subtitle?: string;
  data?: ChartPoint[];
  compact?: boolean;
  mode?: "revenue" | "profit" | "cash";
  provisional?: boolean;
}) {
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      className={compact ? "compact-chart" : "main-chart"}
    >
      {data.length ? (
        <Suspense fallback={<p className="muted">Loading chart…</p>}>
          <FinancialChart data={data} mode={mode} provisional={provisional} />
        </Suspense>
      ) : (
        <div className="chart-empty">
          <div className="chart-grid" aria-hidden="true" />
          <div className="chart-empty-content">
            <span className="empty-icon">
              <ChartNoAxesCombined size={23} />
            </span>
            <h3>Your numbers will tell a story</h3>
            <p>
              No financial activity in this period.
              <br />
              Record sales or transactions to see your trends.
            </p>
          </div>
          {!compact && (
            <div className="chart-axis" aria-hidden="true">
              {[
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
