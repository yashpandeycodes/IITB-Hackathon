/**
 * Small helpers that reproduce how `validator.py` formats and compares values, so our
 * violation messages match its f-strings byte for byte.
 */

/** `isinstance(x, int)` for a JSON value. JSON `2.0` parses to `2` in JS, so it counts as an int here. */
export function isPyInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Python truthiness for a JSON value. */
export function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** `str(x)`: what an f-string prints for `{x}`. */
export function pyStr(value: unknown): string {
  return typeof value === "string" ? value : pyRepr(value);
}

/** `repr(x)` for JSON values (lists, dicts and tuples print their items with `repr`). */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return pyNumber(value);
  if (typeof value === "string") return pyStringRepr(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (typeof value === "object") {
    const items = Object.entries(value).map(
      ([key, item]) => `${pyStringRepr(key)}: ${pyRepr(item)}`,
    );
    return `{${items.join(", ")}}`;
  }
  return String(value);
}

/** `repr(tuple)` for a 2-tuple such as `('MON', 2)`. */
export function pyTupleRepr(items: readonly unknown[]): string {
  if (items.length === 1) return `(${pyRepr(items[0])},)`;
  return `(${items.map(pyRepr).join(", ")})`;
}

function pyNumber(value: number): string {
  if (Number.isNaN(value)) return "nan";
  if (!Number.isFinite(value)) return value > 0 ? "inf" : "-inf";
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return String(value);
  // Python switches to exponent notation outside 1e-4 <= |x| < 1e16 and pads the exponent to 2 digits.
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent >= -4 && exponent < 16) return String(value);
  const [mantissa, exp] = value.toExponential().split("e");
  const sign = exp.startsWith("-") ? "-" : "+";
  const digits = exp.replace(/^[+-]/, "").padStart(2, "0");
  return `${mantissa}e${sign}${digits}`;
}

function pyStringRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\") out += "\\\\";
    else if (char === quote) out += `\\${quote}`;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20 || (code >= 0x7f && code <= 0xa0))
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    else out += char;
  }
  return out + quote;
}

/** Python's default ordering for strings (code-point order). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `sorted(strings)` without mutating the input. */
export function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort(compareStrings);
}

/** `a == b` for JSON scalars, treating a missing value and `null` as the same `None`. */
export function pyEquals(a: unknown, b: unknown): boolean {
  const left = a === undefined ? null : a;
  const right = b === undefined ? null : b;
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A Map key for a tuple of JSON values. Strings and integers are used as-is (the common case),
 * anything else is tagged so `"None"` and `null` stay distinct like they are in Python.
 */
export function tupleKey(...parts: readonly unknown[]): string {
  let key = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i > 0) key += "\u0001";
    if (typeof part === "string") key += part;
    else if (typeof part === "number") key += `\u0002${part}`;
    else key += `\u0003${JSON.stringify(part ?? null)}`;
  }
  return key;
}
