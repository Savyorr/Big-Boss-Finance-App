import {
  Entity,
  previousMonth,
  monthName,
  summary,
  formatMoney as M,
} from "./model";
export function Dashboard({ all }: { all: Entity[] }) {
  const month = previousMonth(),
    r = summary(all, month);
  return (
    <>
      <h2 className="dashboard-month">{monthName(month)}</h2>
      <div className="three-cards">
        {[
          ["Revenue", r.revenue],
          ["Expenses", r.expenses],
          ["Profit", r.profit],
        ].map(([label, amount]) => (
          <section key={label} className="metric" aria-label={String(label)}>
            <span>{label}</span>
            <strong className={label === "Profit" ? "profit" : ""}>
              {M(Number(amount))}
            </strong>
            <small>CAD</small>
          </section>
        ))}
      </div>
    </>
  );
}
