import "server-only";

/**
 * The account allowed to use live assistance is deployment configuration, not a
 * database preference. That keeps a privileged capability out of player-editable
 * state and lets the owner revoke it by removing one environment variable.
 */
export function isDeveloperAccount(userId: string | null | undefined): boolean {
  const developerId = process.env.DEVELOPER_CLERK_USER_ID;
  return Boolean(developerId && userId && userId === developerId);
}

export function canUseDeveloperAssistance(input: {
  userId: string | null | undefined;
  whiteId: string | null;
  blackId: string | null;
  status: "pending" | "active" | "finished" | "abandoned";
}): boolean {
  return (
    input.status === "active" &&
    isDeveloperAccount(input.userId) &&
    (input.whiteId === input.userId || input.blackId === input.userId)
  );
}
