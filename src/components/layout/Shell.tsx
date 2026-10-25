import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  Users,
  Landmark,
  ChartNoAxesCombined,
  Database,
  Settings,
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Moon,
  Sun,
  ShieldCheck,
  CircleHelp,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../../app/context";
import { ShopSelector } from "./ShopSelector";
import { Button } from "../ui/button";
export const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/daily-sales", "Daily Sales", CalendarDays],
  ["/transactions", "Transactions", ArrowLeftRight],
  ["/stylists", "Stylists & Commissions", Users],
  ["/banking", "Banking", Landmark],
  ["/reports", "Reports", ChartNoAxesCombined],
  ["/data", "Data Management", Database],
  ["/settings", "Settings", Settings],
] as const;
export function Shell() {
  const { theme, setTheme, dateFormat } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const focusable = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      ).filter(
        (el) =>
          getComputedStyle(el).display !== "none" &&
          getComputedStyle(el).visibility !== "hidden",
      );
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobile(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      mobileTriggerRef.current?.focus();
    };
  }, [mobile]);
  const location = useLocation();
  useEffect(() => setMobile(false), [location.pathname]);
  const title =
    navigation.find((n) => n[0] === location.pathname)?.[1] ?? "Dashboard";
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
        aria-label="Main navigation"
      >
        <NavLink to="/" className="brand">
          <span className="brand-icon">
            <Crown size={23} />
          </span>
          <span className="brand-text">
            BIG BOSS<small>FINANCE</small>
          </span>
        </NavLink>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={21} />
            <div>
              <strong>Private by design</strong>
              <p>
                Your business. Your device.
                <br />
                Your data stays with you.
              </p>
            </div>
          </div>
          <NavLink to="/data" className="help-link">
            <CircleHelp size={17} />
            <span>Backups & data safety</span>
            <ArrowUpRight size={14} />
          </NavLink>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>Collapse sidebar</span>
          </button>
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
      </aside>
      <div className="main-area" inert={mobile}>
        <header className="topbar">
          <div className="topbar-title">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              ref={mobileTriggerRef}
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </Button>
            <span className="breadcrumb">
              Workspace <span>/</span>
            </span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today">
              {new Date().toLocaleDateString(dateFormat, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <ShopSelector />
            <div className="topbar-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() => {
                setTheme(theme === "light" ? "dark" : "light").catch(() =>
                  setError("Could not save theme."),
                );
              }}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <NavLink to="/settings" aria-label="Open settings">
                <Settings size={18} />
              </NavLink>
            </Button>
            <span className="avatar" title="Local workspace">
              BB
            </span>
          </div>
        </header>
        {error && <p role="alert">{error}</p>}
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <span className="status-dot" /> Local database connected
          </span>
          <span>
            Big Boss Finance <span className="version">v0.4</span>
          </span>
          <span>CAD · Canadian Dollar</span>
        </footer>
      </div>
    </div>
  );
}
