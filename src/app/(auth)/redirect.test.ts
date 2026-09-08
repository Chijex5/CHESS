import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

/* A sign-in page that forwards anywhere after authenticating is an open redirect, and
   the shape phishing wants most: a real login, on the real domain, that lands
   somewhere else. Worth a test file of its own for eight lines of code. */
describe("safeRedirect", () => {
  it("keeps a same-origin path", () => {
    expect(safeRedirect("/g/7FK2MQ")).toBe("/g/7FK2MQ");
    expect(safeRedirect("/play/friend")).toBe("/play/friend");
  });

  it("keeps the query string, which is where an invite can live", () => {
    expect(safeRedirect("/g/ABC?join=1")).toBe("/g/ABC?join=1");
  });

  it("reduces an absolute URL to its path", () => {
    expect(safeRedirect("http://localhost:3000/g/ABC")).toBe("/g/ABC");
    // Even one pointing elsewhere: only the path survives, so it cannot leave.
    expect(safeRedirect("https://evil.example/g/ABC")).toBe("/g/ABC");
  });

  it("refuses a protocol-relative URL", () => {
    expect(safeRedirect("//evil.example")).toBe("/play");
    expect(safeRedirect("//evil.example/path")).toBe("/play");
  });

  it("refuses anything that is not a path", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/play");
    expect(safeRedirect("evil.example")).toBe("/play");
    expect(safeRedirect("")).toBe("/play");
    expect(safeRedirect(undefined)).toBe("/play");
  });

  it("refuses to bounce back to itself", () => {
    expect(safeRedirect("/sign-in")).toBe("/play");
    expect(safeRedirect("/sign-up?redirect_url=%2Fsign-in")).toBe("/play");
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(safeRedirect(["/review", "//evil.example"])).toBe("/review");
  });
});
