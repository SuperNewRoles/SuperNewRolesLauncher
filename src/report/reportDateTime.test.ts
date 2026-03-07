import { describe, expect, it } from "vitest";

import { formatReportDateTime, parseReportDateTime } from "./reportDateTime";

describe("report/reportDateTime", () => {
  it("treats timezone-less timestamps as UTC", () => {
    expect(parseReportDateTime("2026-03-07T12:34:56")?.toISOString()).toBe(
      "2026-03-07T12:34:56.000Z",
    );
  });

  it("supports a space separator and trims long fractions to milliseconds", () => {
    expect(parseReportDateTime("2026-03-07 12:34:56.123456")?.toISOString()).toBe(
      "2026-03-07T12:34:56.123Z",
    );
  });

  it("keeps explicit timezone offsets intact", () => {
    expect(parseReportDateTime("2026-03-07T12:34:56+09:00")?.toISOString()).toBe(
      "2026-03-07T03:34:56.000Z",
    );
  });

  it("returns the original value when formatting an invalid timestamp", () => {
    expect(formatReportDateTime("not-a-date", "ja")).toBe("not-a-date");
  });
});
