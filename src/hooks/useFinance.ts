import { useLiveQuery } from "dexie-react-hooks";
import { readFinance } from "../services/finance";
export function useFinance() {
  return useLiveQuery(() => readFinance(), []);
}
