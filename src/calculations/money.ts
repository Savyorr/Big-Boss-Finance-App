export function parseMoney(input: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(input.trim()))
    throw new Error("Enter an amount with up to two decimal places.");
  const text = input.trim();
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -value : value;
  if (
    signed > BigInt(Number.MAX_SAFE_INTEGER) ||
    signed < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Amount exceeds supported range.");
  return Number(signed);
}
const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});
export function formatMoney(cents: number) {
  if (!Number.isSafeInteger(cents))
    throw new Error("Invalid integer-cent amount for display.");
  const n = BigInt(cents),
    absolute = n < 0n ? -n : n;
  const whole = (n < 0n ? -1 : 1) * Number(absolute / 100n);
  const fraction = String(absolute % 100n).padStart(2, "0");
  return cadFormatter
    .formatToParts(whole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
export function moneyInput(cents: number) {
  const n = BigInt(cents);
  const a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

export function safeCents(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Financial total exceeds the supported range.");
  return Number(value);
}
export function addCents(...values: number[]): number {
  return safeCents(
    values.reduce((sum, value) => {
      if (!Number.isSafeInteger(value)) throw new Error("Invalid cent amount.");
      return sum + BigInt(value);
    }, 0n),
  );
}
export function commissionCents(
  serviceCents: number,
  basisPoints: number,
): number {
  if (
    !Number.isSafeInteger(serviceCents) ||
    serviceCents < 0 ||
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  )
    throw new Error("Invalid service amount or commission rate.");
  return safeCents(
    (BigInt(serviceCents) * BigInt(basisPoints) + 5000n) / 10000n,
  );
}
