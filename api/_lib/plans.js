/**
 * PerData - Plan entitlements (single source of truth).
 * The client receives this table from /api/billing?action=config, so editing it
 * here changes gating on both sides.
 */

export const PLANS = {
  anon: {
    id: "anon",
    label: "Sin cuenta",
    ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y"],
    maxHorizon: 1,
    excel: false
  },
  free: {
    id: "free",
    label: "Gratis",
    ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y"],
    maxHorizon: 6,
    excel: false
  },
  // Boletín: the terminal stays as in Gratis; adds the personal section of the daily newsletter.
  boletin: {
    id: "boletin",
    label: "Boletín",
    ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y"],
    maxHorizon: 6,
    excel: false,
    boletinPersonal: true
  },
  pro: {
    id: "pro",
    label: "Pro",
    ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y", "max"],
    maxHorizon: 36,
    excel: true,
    boletinPersonal: true
  }
};

// Stripe subscription statuses that grant Pro access.
export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function planForUser(user) {
  if (!user) return PLANS.anon;
  return PLANS[user.plan] && user.plan !== "anon" ? PLANS[user.plan] : PLANS.free;
}

export function canUseRange(plan, range) {
  return plan.ranges.includes(range);
}

export function canUseHorizon(plan, months) {
  return months <= plan.maxHorizon;
}

/** Shared 403 body so the client can open the right prompt. */
export function upgradeRequired(plan, feature) {
  const needsAccount = plan.id === "anon";
  return {
    success: false,
    code: needsAccount ? "auth_required" : "upgrade_required",
    feature,
    error: needsAccount
      ? "Crea una cuenta gratuita o inicia sesión para usar esta función."
      : "Esta función es parte del plan Pro."
  };
}
