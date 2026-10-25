// A bounded JSON parser retains numeric lexemes so decimal money is never rounded by JSON.parse.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export interface ParsedJson {
  value: any;
  numbers: Map<string, string>;
  text: string;
}
export function parseJson(text: string): ParsedJson {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error("File exceeds the 25 MB import limit.");
  let i = 0,
    nodes = 0;
  const numbers = new Map<string, string>();
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const bad = () => {
    throw new Error(`Invalid JSON near character ${i + 1}.`);
  };
  const whitespace = () => {
    while (/[\t\n\r ]/.test(text[i] ?? "!")) i++;
  };
  function string() {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        try {
          return JSON.parse(text.slice(start, i)) as string;
        } catch {
          bad();
        }
      }
      if (c === "\\") i++;
    }
    return bad();
  }
  function read(depth: number, path: string): any {
    if (depth > 32) throw new Error("JSON nesting exceeds 32 levels.");
    if (++nodes > 1000000) throw new Error("JSON contains too many values.");
    whitespace();
    const c = text[i];
    if (c === '"') return string();
    if (c === "{") {
      i++;
      const value = Object.create(null);
      const keys = new Set<string>();
      whitespace();
      if (text[i] === "}") {
        i++;
        return value;
      }
      while (i < text.length) {
        whitespace();
        if (text[i] !== '"') bad();
        const key = string();
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw new Error("Unsafe object key in JSON.");
        if (keys.has(key)) throw new Error(`Duplicate JSON property: ${key}`);
        keys.add(key);
        whitespace();
        if (text[i++] !== ":") bad();
        value[key] = read(
          depth + 1,
          `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        );
        whitespace();
        const end = text[i++];
        if (end === "}") return value;
        if (end !== ",") bad();
      }
      bad();
    }
    if (c === "[") {
      i++;
      const value: any[] = [];
      whitespace();
      if (text[i] === "]") {
        i++;
        return value;
      }
      while (i < text.length) {
        value.push(read(depth + 1, `${path}/${value.length}`));
        whitespace();
        const end = text[i++];
        if (end === "]") return value;
        if (end !== ",") bad();
      }
      bad();
    }
    for (const [token, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const)
      if (text.startsWith(token, i)) {
        i += token.length;
        return value;
      }
    numberPattern.lastIndex = i;
    const match = numberPattern.exec(text);
    if (!match) bad();
    const token = match![0];
    i += token.length;
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Nonfinite JSON number.");
    numbers.set(path, token);
    return value;
  }
  const value = read(0, "");
  whitespace();
  if (i !== text.length) bad();
  return { value, numbers, text };
}
export function exactScaled(token: string, scale: number): number {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!m) throw new Error("Invalid decimal amount.");
  let n = BigInt(m[2] + (m[3] ?? ""));
  const exp = Number(m[4] ?? 0) - (m[3]?.length ?? 0) + scale;
  if (n === 0n) return 0;
  if (Math.abs(exp) > 400)
    throw new Error("Amount exceeds supported precision.");
  if (exp >= 0) n *= 10n ** BigInt(exp);
  else {
    const divisor = 10n ** BigInt(-exp);
    if (n % divisor !== 0n)
      throw new Error(
        "Financial amount has unsupported precision; no rounding was applied.",
      );
    n /= divisor;
  }
  if (m[1]) n = -n;
  if (
    n > BigInt(Number.MAX_SAFE_INTEGER) ||
    n < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Amount exceeds the safe integer-cent range.");
  return Number(n);
}
export function moneyAt(
  parsed: ParsedJson,
  path: string,
  value: unknown,
): number {
  const token = parsed.numbers.get(path);
  if (token !== undefined) return exactScaled(token, 2);
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return exactScaled(value, 2);
  throw new Error(`Missing or invalid financial amount at ${path}.`);
}
export function canonical(value: any): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}
export async function digest(text: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function stableId(seed: string) {
  const hex = await digest(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
