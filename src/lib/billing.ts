export const BILLING_PLANS = {
  monthly: {
    label: "Monthly",
    amount: 12.99,
    currency: "USD",
    interval: "month",
    paddlePriceId: process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID ?? "",
  },
  yearly: {
    label: "Yearly",
    amount: 129,
    currency: "USD",
    interval: "year",
    paddlePriceId: process.env.NEXT_PUBLIC_PADDLE_YEARLY_PRICE_ID ?? "",
  },
} as const;

const TRIAL_DAYS = 14;

export function getTrialState(
  workspaceCreatedAt: string,
  now = new Date(),
): {
  active: boolean;
  daysRemaining: number;
  endsAt: string;
} {
  const createdAt = new Date(workspaceCreatedAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Invalid workspace creation date");
  }
  const endsAt = new Date(createdAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + TRIAL_DAYS);
  const remainingMs = endsAt.getTime() - now.getTime();

  return {
    active: remainingMs > 0,
    daysRemaining: Math.max(
      0,
      Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
    ),
    endsAt: endsAt.toISOString(),
  };
}
