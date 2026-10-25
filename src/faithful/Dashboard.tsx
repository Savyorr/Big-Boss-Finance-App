import { lazy, Suspense, useMemo, useState } from "react";
import {
  type Entity,
  previousMonth,
  monthName,
  summary,
  dailyIncome,
  formatMoney as M,
} from "./model";
import {
  expenseBreakdown,
  historicalMonths,
  shiftMonth,
  comparison,
} from "./analytics";
import { Field } from "./ui";
const DashboardCharts = lazy(() => import("./DashboardCharts"));
export function Dashboard({ all }: { all: Entity[] }) {
  const latest = previousMonth(),
    [month, setMonth] = useState(latest);
  const data = useMemo(
    () => ({
      daily: dailyIncome(all, month),
      expenses: expenseBreakdown(all, month),
      history: historicalMonths(all, month),
      totals: summary(all, month),
      comparisons: {
        revenue: comparison(all, month, "revenue"),
        expenses: comparison(all, month, "expenses"),
        profit: comparison(all, month, "profit"),
      },
    }),
    [all, month],
  );
  return (
    <>
      <div className="month-controls">
        <button
          aria-label="Previous Month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ← Previous Month
        </button>
        <Field label="Dashboard month">
          <input
            type="month"
            value={month}
            max={latest}
            onChange={(e) => {
              const m = e.target.value;
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= latest) setMonth(m);
            }}
          />
        </Field>
        <button
          aria-label="Next Month"
          disabled={month >= latest}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          Next Month →
        </button>
      </div>
      <h2 className="dashboard-month">{monthName(month)}</h2>
      <Suspense fallback={<p role="status">Loading local financial charts…</p>}>
        <DashboardCharts
          month={month}
          data={data}
          cards={
            <div className="three-cards">
              {(["revenue", "expenses", "profit"] as const).map((key) => (
                <section
                  key={key}
                  className="metric"
                  aria-label={key[0].toUpperCase() + key.slice(1)}
                >
                  <span>{key[0].toUpperCase() + key.slice(1)}</span>
                  <strong
                    className={
                      key === "expenses" ||
                      (key === "profit" && data.totals[key] < 0)
                        ? "expense"
                        : "income"
                    }
                  >
                    {M(data.totals[key])}
                  </strong>
                  <small>CAD · recorded</small>
                  <p className="comparison">{data.comparisons[key]}</p>
                </section>
              ))}
            </div>
          }
        />
      </Suspense>
    </>
  );
}
