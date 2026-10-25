import { useState } from "react";
import { useApp } from "../../app/context";
import { useFinance } from "../../hooks/useFinance";
import { scoped, movements, accountBalance } from "../../calculations/finance";
import { formatMoney } from "../../calculations/money";
import { today } from "../../utils/dates";
import { Panel, Field, DateInput, DataTable, LoadingState } from "../ui/shared";
import { ReconciliationForm } from "./Reconciliation";
export function BankingWorkspace({ tab }: { tab: string }) {
  const { scope } = useApp();
  const data = useFinance();
  const [accountId, setAccount] = useState("");
  const [through, setThrough] = useState(today());
  if (!data) return <LoadingState />;
  const accounts = scoped(data.accounts, scope).filter((a) => !a.deletedAt);
  const account = accounts.find((a) => a.id === accountId);
  const rows = account ? movements(data, account, through) : [];
  return (
    <Panel
      title={tab}
      subtitle="Positive balances are assets; negative credit-card and loan balances are amounts owed."
    >
      <div className="form-stack">
        <Field label="Banking account">
          <select
            value={accountId}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Select an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {tab === "Reconciliation" ? (
          account && <ReconciliationForm key={account.id} account={account} />
        ) : (
          <>
            <Field label="Balance through">
              <DateInput
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </Field>
            {account && (
              <p>
                Closing balance:{" "}
                <strong>
                  {accountBalance(data, account, through) === null
                    ? "Before opening date"
                    : formatMoney(accountBalance(data, account, through)!)}
                </strong>
              </p>
            )}
            <DataTable
              columns={["Date", "Description", "Type", "Movement"]}
              empty={!rows.length}
              title="Choose an account with movements"
            >
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.date}</td>
                  <td>{r.description}</td>
                  <td>{r.kind}</td>
                  <td>{formatMoney(r.deltaCents)}</td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </div>
    </Panel>
  );
}
