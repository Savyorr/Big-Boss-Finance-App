import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../database/db";
import { repository } from "../database/repository";
import type { Shop, ShopScope } from "../models";
import { ErrorMessage, LoadingState } from "../components/ui/shared";
interface Context {
  shops: Shop[];
  scope: ShopScope;
  setScope: (scope: ShopScope) => Promise<void>;
  locationName: string;
  theme: string;
  setTheme: (value: string) => Promise<void>;
  dateFormat: string;
  setDateFormat: (value: string) => Promise<void>;
}
const AppContext = createContext<Context | null>(null);
export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error("Missing application context");
  return value;
};
export function AppProvider({ children }: { children: ReactNode }) {
  const [failure, setFailure] = useState("");
  const data = useLiveQuery(async () => {
    try {
      return await db.transaction("r", db.shops, db.settings, async () => ({
        shops: await db.shops.toArray(),
        settings: await db.settings.toArray(),
      }));
    } catch {
      setFailure(
        "Local database could not open. Check browser storage permissions. Your data has not been reset.",
      );
      return undefined;
    }
  }, []);
  const get = (key: string, fallback: string) =>
    String(data?.settings.find((s) => s.key === key)?.value ?? fallback);
  const theme = get("theme", "light");
  const dateFormat = get("dateFormat", "en-CA");
  const requestedScope = get("activeShop", "all");
  const scope =
    requestedScope === "all" ||
    data?.shops.some((s) => s.id === requestedScope && s.status === "active")
      ? requestedScope
      : "all";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  if (failure)
    return (
      <main className="boot-error">
        <h1>Unable to open local storage</h1>
        <ErrorMessage message={failure} />
      </main>
    );
  if (!data) return <LoadingState />;
  return (
    <AppContext.Provider
      value={{
        shops: data.shops,
        scope,
        setScope: async (s) => {
          await repository.selectShop(s);
        },
        locationName:
          scope === "all"
            ? "All Locations"
            : (data.shops.find((s) => s.id === scope)?.name ?? "All Locations"),
        theme,
        setTheme: async (v) => {
          await repository.setPreference("theme", v);
        },
        dateFormat,
        setDateFormat: async (v) => {
          await repository.setPreference("dateFormat", v);
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
