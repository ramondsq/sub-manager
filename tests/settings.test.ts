import { describe, expect, it } from "vitest";
import { parseBarkUrl, parseRemindDays } from "../worker/settings";

describe("parseBarkUrl", () => {
  it("accepts the URL copied from the Bark app", () => {
    expect(parseBarkUrl("https://api.day.app/AbC123/")).toEqual({ endpoint: "https://api.day.app/push", key: "AbC123" });
    expect(parseBarkUrl("https://api.day.app/AbC123/这里改成你自己的推送内容")).toEqual({
      endpoint: "https://api.day.app/push",
      key: "AbC123",
    });
  });
  it("accepts a bare key and self-hosted servers", () => {
    expect(parseBarkUrl("AbC123")).toEqual({ endpoint: "https://api.day.app/push", key: "AbC123" });
    expect(parseBarkUrl("https://bark.example.com:8080/key1")).toEqual({
      endpoint: "https://bark.example.com:8080/push",
      key: "key1",
    });
  });
  it("rejects invalid input", () => {
    expect(parseBarkUrl("")).toBeNull();
    expect(parseBarkUrl("https://api.day.app/")).toBeNull();
    expect(parseBarkUrl("ftp://api.day.app/key")).toBeNull();
    expect(parseBarkUrl("not a key!")).toBeNull();
  });
});

describe("parseRemindDays", () => {
  it("parses, dedupes and sorts", () => {
    expect(parseRemindDays("1, 3，0 -1 3")).toEqual([3, 1, 0, -1]);
    expect(parseRemindDays("")).toEqual([]);
  });
  it("rejects non-integers", () => {
    expect(() => parseRemindDays("1,a")).toThrow();
    expect(() => parseRemindDays("1.5")).toThrow();
  });
});
