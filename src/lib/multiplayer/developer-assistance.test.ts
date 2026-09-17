import { afterEach, describe, expect, it } from "vitest";
import { canUseDeveloperAssistance } from "./developer-assistance";

const originalDeveloperId = process.env.DEVELOPER_CLERK_USER_ID;

afterEach(() => {
  if (originalDeveloperId === undefined) delete process.env.DEVELOPER_CLERK_USER_ID;
  else process.env.DEVELOPER_CLERK_USER_ID = originalDeveloperId;
});

describe("canUseDeveloperAssistance", () => {
  const game = { whiteId: "user_developer", blackId: "user_opponent", status: "active" as const };

  it("permits only the configured developer while seated in an active game", () => {
    process.env.DEVELOPER_CLERK_USER_ID = "user_developer";
    expect(canUseDeveloperAssistance({ ...game, userId: "user_developer" })).toBe(true);
  });

  it("rejects an opponent, spectator, inactive game, or absent configuration", () => {
    process.env.DEVELOPER_CLERK_USER_ID = "user_developer";
    expect(canUseDeveloperAssistance({ ...game, userId: "user_opponent" })).toBe(false);
    expect(canUseDeveloperAssistance({ ...game, userId: "user_spectator" })).toBe(false);
    expect(canUseDeveloperAssistance({ ...game, status: "finished", userId: "user_developer" })).toBe(false);
    delete process.env.DEVELOPER_CLERK_USER_ID;
    expect(canUseDeveloperAssistance({ ...game, userId: "user_developer" })).toBe(false);
  });
});
