import { describe, expect, it } from "vitest";

import { isPyInt, pyEquals, pyRepr, pyStr, pyTupleRepr, pyTruthy } from "./py";

describe("Python formatting helpers", () => {
  it("str() of scalars", () => {
    expect(pyStr("MON")).toBe("MON");
    expect(pyStr(null)).toBe("None");
    expect(pyStr(undefined)).toBe("None");
    expect(pyStr(true)).toBe("True");
    expect(pyStr(3)).toBe("3");
    expect(pyStr(2.5)).toBe("2.5");
    expect(pyStr(1e-7)).toBe("1e-07");
  });

  it("repr() of lists, dicts and tuples", () => {
    expect(pyRepr(["classroom", "lecture_hall"])).toBe(
      "['classroom', 'lecture_hall']",
    );
    expect(pyRepr([])).toBe("[]");
    expect(pyRepr({ a: [1, null] })).toBe("{'a': [1, None]}");
    expect(pyTupleRepr(["MON", 4])).toBe("('MON', 4)");
  });

  it("repr() picks quotes like Python", () => {
    expect(pyRepr("people's hall")).toBe(`"people's hall"`);
    expect(pyRepr(`it's "big"`)).toBe(`'it\\'s "big"'`);
    expect(pyRepr("a\nb\\")).toBe("'a\\nb\\\\'");
  });

  it("isinstance(x, int), truthiness and equality", () => {
    expect(isPyInt(3)).toBe(true);
    expect(isPyInt(2.5)).toBe(false);
    expect(isPyInt("3")).toBe(false);
    expect(pyTruthy([])).toBe(false);
    expect(pyTruthy("")).toBe(false);
    expect(pyTruthy({ a: 1 })).toBe(true);
    expect(pyEquals(undefined, null)).toBe(true);
    expect(pyEquals("MON", "MON")).toBe(true);
    expect(pyEquals(2, "2")).toBe(false);
  });
});
