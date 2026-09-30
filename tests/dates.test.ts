import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, isValidDate, zonedNow } from "../shared/dates";

describe("addMonths", () => {
  it("adds months within a year", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-03-10", 6)).toBe("2026-09-10");
  });
  it("rolls over the year", () => {
    expect(addMonths("2026-11-20", 3)).toBe("2027-02-20");
    expect(addMonths("2026-09-30", 12)).toBe("2027-09-30");
  });
  it("clamps to the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });
  it("supports negative months", () => {
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("day helpers", () => {
  it("diffDays", () => {
    expect(diffDays("2026-09-30", "2026-10-03")).toBe(3);
    expect(diffDays("2026-10-03", "2026-09-30")).toBe(-3);
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
  });
  it("addDays", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("isValidDate", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-01")).toBe(false);
  });
  it("zonedNow", () => {
    const t = new Date("2026-09-30T17:30:00Z");
    expect(zonedNow("Asia/Shanghai", t)).toEqual({ date: "2026-10-01", hour: 1 });
    expect(zonedNow("UTC", t)).toEqual({ date: "2026-09-30", hour: 17 });
  });
});
