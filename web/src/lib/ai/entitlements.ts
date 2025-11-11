// Minimal entitlements map for user types used in chat APIs
export const entitlementsByUserType = {
  free: { maxMessagesPerDay: 100 },
  pro: { maxMessagesPerDay: 1000 },
  enterprise: { maxMessagesPerDay: 10000 },
} as const;

export type UserType = keyof typeof entitlementsByUserType;