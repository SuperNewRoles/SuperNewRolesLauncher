import { describe, expect, it } from "vitest";

import { isOwnReportMessage } from "./messageOwnership";

describe("report/messageOwnership", () => {
  it("treats sender equal to token as own message", () => {
    expect(isOwnReportMessage("token-123", "token-123")).toBe(true);
  });

  it("trims sender and token before comparing", () => {
    expect(isOwnReportMessage(" token-123 ", "  token-123")).toBe(true);
  });

  it("treats a different sender as other", () => {
    expect(isOwnReportMessage("github:staff", "token-123")).toBe(false);
  });

  it("treats missing sender or token as other", () => {
    expect(isOwnReportMessage(undefined, "token-123")).toBe(false);
    expect(isOwnReportMessage("token-123", null)).toBe(false);
  });
});
