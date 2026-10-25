import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
} from "react";
import type { BusinessDB } from "./store";
import type { Entity } from "./model";
import { parseMoney as P } from "./model";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement<{ id?: string; "aria-label"?: string }>(child) &&
        typeof child.type === "string" &&
        ["input", "select", "textarea", "output"].includes(child.type)
          ? cloneElement(child, { id, "aria-label": label })
          : child,
      )}
    </div>
  );
}
export function Money({
  label,
  name,
  value = "0",
  signed = false,
  readOnly = false,
}: {
  label: string;
  name: string;
  value?: string;
  signed?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        aria-label={label}
        type="number"
        step="0.01"
        min={signed ? undefined : 0}
        defaultValue={value}
        readOnly={readOnly}
        required
      />
    </Field>
  );
}
export function Table({
  heads,
  children,
}: {
  heads: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label={heads.join(", ") + " table"}
    >
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function text(f: FormData, k: string) {
  return String(f.get(k) ?? "").trim();
}
export function cents(f: FormData, k: string) {
  return P(text(f, k) || "0");
}
export function Confirm({
  title,
  children,
  onClose,
  onConfirm,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
        <div className="actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={onConfirm} disabled={busy}>
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}
export type Common = {
  db: BusinessDB;
  all: Entity[];
  run: (fn: () => Promise<void>) => Promise<void>;
  notify: (s: string) => void;
  busy: boolean;
};
