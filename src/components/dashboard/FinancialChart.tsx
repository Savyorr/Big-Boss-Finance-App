import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartPoint } from "./ChartPanel";
import { formatMoney } from "../../calculations/money";
// Amounts remain integer cents; only presentation converts to a CAD display.
export default function FinancialChart({
  data,
  mode = "revenue",
  provisional = false,
}: {
  data: ChartPoint[];
  mode?: "revenue" | "profit" | "cash";
  provisional?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="period" stroke="var(--muted)" />
        <YAxis
          width="auto"
          stroke="var(--muted)"
          tickFormatter={(value) => formatMoney(Math.round(value))}
        />
        <Tooltip
          formatter={(v) => formatMoney(Number(v))}
          contentStyle={{
            background: "var(--surface)",
            color: "var(--text)",
            borderColor: "var(--border)",
          }}
        />
        <Area
          type="monotone"
          dataKey={mode === "revenue" ? "revenue" : mode}
          name={
            mode === "revenue"
              ? provisional
                ? "Recorded Revenue"
                : "Revenue"
              : mode === "profit"
                ? provisional
                  ? "Recorded difference"
                  : "Operating profit"
                : "Cash movement"
          }
          stroke="var(--primary)"
          fill="var(--primary-soft)"
        />
        {mode === "revenue" && (
          <Area
            type="monotone"
            dataKey="expenses"
            name={provisional ? "Recorded Expenses" : "Expenses"}
            stroke="var(--muted)"
            fill="transparent"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
