import { useState, type ReactNode } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  type dailyIncome,
  type summary,
  formatMoney as M,
  monthName,
} from "./model";
import type { expenseBreakdown, historicalMonths } from "./analytics";
import { Field, Table } from "./ui";
const palette = [
  "#397DDE",
  "#15965D",
  "#DA8426",
  "#8760BB",
  "#158F9E",
  "#D94C58",
  "#AB7635",
  "#64748B",
  "#A65291",
  "#76953F",
  "#5866AD",
  "#B45B31",
];
const axis = { stroke: "var(--muted)", fontSize: 12 };
const moneyTick = (n: number) => M(Math.round(n));
const tipStyle = {
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 8,
};
type Data = {
  daily: ReturnType<typeof dailyIncome>;
  expenses: ReturnType<typeof expenseBreakdown>;
  history: ReturnType<typeof historicalMonths>;
  totals: ReturnType<typeof summary>;
};
export default function DashboardCharts({
  month,
  data,
  cards,
}: {
  month: string;
  data: Data;
  cards: ReactNode;
}) {
  const [selected, setSelected] = useState("");
  const day =
    data.daily.find((d) => d.date === selected) ??
    data.daily.find((d) => d.revenue !== null) ??
    data.daily[0];
  const categoryColor = (category: string) =>
    palette[
      data.expenses.findIndex((e) => e.category === category) % palette.length
    ];
  const signed = data.expenses.some((e) => e.amount < 0),
    positive = data.expenses.filter((e) => e.amount > 0);
  return (
    <div className="dashboard-sections">
      <section
        className="panel daily-income-panel"
        aria-labelledby="daily-income-title"
      >
        <h2 id="daily-income-title">Daily Income Graph</h2>
        <p className="muted small">
          {monthName(month)} · Recorded revenue by day. Gaps mean no saved
          revenue record; a saved zero is shown at $0.00.
        </p>
        <div
          className="chart-frame daily-chart"
          tabIndex={0}
          role="img"
          aria-label={"Daily recorded income for " + monthName(month)}
        >
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.daily}
                margin={{ top: 20, right: 24, bottom: 16, left: 0 }}
              >
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(Number(v.slice(8)))}
                  interval="preserveStartEnd"
                  padding={{ left: 8, right: 8 }}
                  tick={{ ...axis, fontSize: 10 }}
                  minTickGap={8}
                />
                <YAxis
                  width="auto"
                  padding={{ top: 12, bottom: 8 }}
                  tick={axis}
                  tickFormatter={moneyTick}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !label) return null;
                    const d = data.daily.find((d) => d.date === label);
                    return (
                      <div className="chart-tooltip">
                        <strong>{label}</strong>
                        <p>
                          {d?.revenue == null
                            ? "Missing record"
                            : M(d.revenue) + " CAD"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="linear"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="var(--income)"
                  fill="var(--income-soft)"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "var(--income)" }}
                  activeDot={(p: any) => (
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={6}
                      fill="var(--income)"
                      role="button"
                      tabIndex={0}
                      aria-label={"Select revenue " + p.payload.date}
                      onClick={() => setSelected(p.payload.date)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(p.payload.date);
                        }
                      }}
                    />
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="chart-selection">
          <Field label="Select revenue day">
            <select
              value={day.date}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.daily.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date} ·{" "}
                  {d.revenue === null ? "Missing record" : M(d.revenue)}
                </option>
              ))}
            </select>
          </Field>
          <p role="status" className="selected-income">
            <strong>{day.date}</strong> ·{" "}
            {day.revenue === null ? "Missing record" : M(day.revenue) + " CAD"}{" "}
            · {day.status}
          </p>
        </div>
        <details>
          <summary>Daily income values and record coverage</summary>
          <Table heads={["Date", "Recorded revenue", "Record status"]}>
            {data.daily.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td className="income">
                  {d.revenue === null ? "Not recorded" : M(d.revenue)}
                </td>
                <td>
                  {d.status}
                  {d.ambiguous
                    ? " · source confirmation required in Daily Sales / Reports"
                    : ""}
                </td>
              </tr>
            ))}
          </Table>
        </details>
      </section>
      <section className="panel" aria-labelledby="expense-title">
        <h2 id="expense-title">Expense Breakdown</h2>
        <p className="muted small">
          {monthName(month)} · Recorded expense fields only; bank withdrawals
          are separate.
        </p>
        {!data.expenses.length ? (
          <p className="empty">No recorded expenses in this month.</p>
        ) : (
          <div className="expense-layout">
            <div
              className="chart-frame donut-chart"
              role="img"
              aria-label="Recorded expenses by category"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={positive}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius="58%"
                    outerRadius="85%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {positive.map((e, i) => (
                      <Cell key={e.category} fill={categoryColor(e.category)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, name) => [M(Number(v)) + " CAD", name]}
                    contentStyle={tipStyle}
                    itemStyle={{ color: "var(--ink)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div
              className="expense-legend"
              aria-label="Expense category legend"
            >
              {data.expenses.map((e, i) => (
                <div className="expense-category" key={e.category}>
                  <span
                    className="category-dot"
                    style={{ background: categoryColor(e.category) }}
                    aria-hidden="true"
                  />
                  <span>{e.category}</span>
                  <strong>{M(e.amount)}</strong>
                  <small>
                    {e.percent === null ? "—" : e.percent.toFixed(1) + "%"}
                  </small>
                </div>
              ))}
              <div className="expense-total">
                <strong>Total recorded expenses</strong>
                <strong>{M(data.totals.expenses)}</strong>
              </div>
              {signed && (
                <p className="muted small">
                  Expense credits are listed with their negative amounts. The
                  donut shows positive charges; percentages use the net recorded
                  total.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <section
        aria-labelledby="statistics-title"
        className="monthly-statistics"
      >
        <h2 id="statistics-title">Monthly Financial Statistics</h2>
        {cards}
      </section>
      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">Historical Monthly Performance</h2>
        <p className="muted small">
          12 months ending {monthName(month)}. Missing months have no bars;
          recorded months may have incomplete coverage.
        </p>
        <div
          className="chart-frame history-chart"
          tabIndex={0}
          role="img"
          aria-label="Historical recorded revenue expenses and profit"
        >
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.history}
                margin={{ top: 8, right: 12, bottom: 12, left: 8 }}
              >
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ ...axis, fontSize: 10 }}
                  tickFormatter={(v) =>
                    new Date(v + "-01T12:00:00").toLocaleDateString("en-CA", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                  interval={0}
                />
                <YAxis width="auto" tick={axis} tickFormatter={moneyTick} />
                <ReferenceLine y={0} stroke="var(--muted)" />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="chart-tooltip">
                        <strong>{monthName(String(label))}</strong>
                        {payload.map((p) => (
                          <p
                            key={String(p.dataKey)}
                            style={{
                              color:
                                p.dataKey === "revenue"
                                  ? "var(--revenue-chart)"
                                  : p.dataKey === "expenses" ||
                                      (p.dataKey === "profit" &&
                                        Number(p.value) < 0)
                                    ? "var(--expense-chart)"
                                    : "var(--profit-chart)",
                            }}
                          >
                            {p.name}: {M(Number(p.value))} CAD
                          </p>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <Legend />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="var(--revenue-chart)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="var(--expense-chart)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="profit"
                  name="Profit / loss"
                  fill="var(--profit-chart)"
                  isAnimationActive={false}
                >
                  {data.history.map((m) => (
                    <Cell
                      key={m.month}
                      fill={
                        m.profit !== null && m.profit < 0
                          ? "var(--expense-chart)"
                          : "var(--profit-chart)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <details>
          <summary>Monthly performance figures</summary>
          <Table
            heads={[
              "Month",
              "Revenue",
              "Expenses",
              "Profit / loss",
              "Revenue days recorded",
            ]}
          >
            {data.history.map((m) => (
              <tr key={m.month}>
                <td>{m.label}</td>
                <td className="income">
                  {m.revenue === null ? "Not recorded" : M(m.revenue)}
                </td>
                <td className="expense">
                  {m.expenses === null ? "Not recorded" : M(m.expenses)}
                </td>
                <td
                  className={
                    m.profit !== null && m.profit < 0 ? "expense" : "income"
                  }
                >
                  {m.profit === null ? "Not recorded" : M(m.profit)}
                </td>
                <td>
                  {m.coverage} / {m.days}
                </td>
              </tr>
            ))}
          </Table>
        </details>
      </section>
    </div>
  );
}
