import { Component, lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context";
import { Shell } from "../components/layout/Shell";
const DashboardPage = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/Settings").then((m) => ({ default: m.SettingsPage })),
);
const ProfilesPage = lazy(() =>
  import("../pages/Profiles").then((m) => ({ default: m.ProfilesPage })),
);
const TransactionsPage = lazy(() =>
  import("../pages/Transactions").then((m) => ({
    default: m.TransactionsPage,
  })),
);
const DailySalesPage = lazy(() =>
  import("../pages/DailySales").then((m) => ({ default: m.DailySalesPage })),
);
const ReportsPage = lazy(() =>
  import("../pages/Reports").then((m) => ({ default: m.ReportsPage })),
);
const DataManagementPage = lazy(() =>
  import("../pages/DataManagement").then((m) => ({
    default: m.DataManagementPage,
  })),
);
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="boot-error">
        <h1>Something interrupted your workspace</h1>
        <p>
          No database reset has been performed. Reload to try again; keep this
          browser profile to preserve local records.
        </p>
        <button onClick={() => window.location.reload()}>
          Reload application
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <Suspense
            fallback={
              <p role="status" className="page">
                Opening workspace…
              </p>
            }
          >
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<DashboardPage />} />
                <Route path="daily-sales" element={<DailySalesPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route
                  path="stylists"
                  element={<ProfilesPage key="stylist" kind="stylist" />}
                />
                <Route
                  path="banking"
                  element={<ProfilesPage key="account" kind="account" />}
                />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="data" element={<DataManagementPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
