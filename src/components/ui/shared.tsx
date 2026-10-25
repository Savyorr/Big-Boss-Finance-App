import { Inbox, Info, LoaderCircle } from "lucide-react";
import {
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hint ? `${id}-hint` : undefined },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="money-input">
      <span aria-hidden="true">CAD</span>
      <input inputMode="decimal" placeholder="0.00" {...props} />
    </div>
  );
}
export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" required {...props} />;
}
export function EmptyState({
  title = "No records yet",
  description = "Your records will appear here.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="error-message" role="alert">
      {message}
    </p>
  );
}
export function LoadingState() {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle className="spin" />
      Opening your local workspace…
    </div>
  );
}
export function StageNotice({
  stage = 2,
  children,
}: {
  stage?: number;
  children?: ReactNode;
}) {
  return (
    <div className="notice">
      <Info size={17} />
      <span>
        {children ??
          `This workspace is ready for Stage ${stage}. Financial processing is not available yet.`}
      </span>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function DataTable({
  columns,
  children,
  empty = true,
  title,
  description,
}: {
  columns: string[];
  children?: ReactNode;
  empty?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={
        title ? `${title} table` : `${columns[0] ?? "Financial"} table`
      }
    >
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={title} description={description} />
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}
