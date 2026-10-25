import Dexie from "dexie";
import { FinanceDatabase } from "../database/db";
import { createRepository } from "../database/repository";
export const PROFILE_SESSION_KEY = "big-boss-active-business";
export const PROFILE_PREFIX = "big-boss-business-";
export interface BusinessProfile {
  database: string;
  name: string;
  shops: number;
}
export function selectedDatabase() {
  try {
    const value = sessionStorage.getItem(PROFILE_SESSION_KEY);
    return value === "big-boss-finance" || value?.startsWith(PROFILE_PREFIX)
      ? value
      : null;
  } catch {
    return null;
  }
}
export async function listBusinessProfiles(): Promise<BusinessProfile[]> {
  const names = await Dexie.getDatabaseNames();
  const profiles: BusinessProfile[] = [];
  for (const database of names.filter(
    (n) => n === "big-boss-finance" || n.startsWith(PROFILE_PREFIX),
  )) {
    const connection = new FinanceDatabase(database);
    try {
      const shops = (await connection.shops.toArray()).filter(
        (s) => !s.deletedAt,
      );
      // The old database remains untouched, including archived shops and every recovery snapshot.
      if (!shops.length && database === "big-boss-finance") continue;
      profiles.push({
        database,
        name: String(
          (await connection.settings.get("businessProfileName"))?.value ??
            shops[0]?.name ??
            "Business profile",
        ),
        shops: shops.length,
      });
    } finally {
      connection.close();
    }
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
export async function createBusinessProfile(name: string, empty = false) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100)
    throw new Error("Enter a business name (up to 100 characters).");
  if (
    (await listBusinessProfiles()).some(
      (p) => p.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    )
  )
    throw new Error(
      "A business profile with this name already exists. Open it from the list above, or choose a different name.",
    );
  const database = PROFILE_PREFIX + crypto.randomUUID();
  const connection = new FinanceDatabase(database);
  try {
    const repo = createRepository(connection);
    await repo.setPreference("businessProfileName", trimmed);
    if (empty) return { database, name: trimmed, shops: 0 };
    const shop = await repo.createShop({
      name: trimmed,
      address: "",
      contact: "",
    });
    await repo.selectShop(shop.id);
    return { database, name: shop.name, shops: 1 };
  } finally {
    connection.close();
  }
}
export function openBusinessProfile(database: string, route = "/") {
  if (database !== "big-boss-finance" && !database.startsWith(PROFILE_PREFIX))
    throw new Error("Invalid business profile.");
  sessionStorage.setItem(PROFILE_SESSION_KEY, database);
  window.location.hash = route;
  window.location.reload();
}
export function switchBusinessProfile() {
  sessionStorage.removeItem(PROFILE_SESSION_KEY);
  window.location.hash = "/";
  window.location.reload();
}
