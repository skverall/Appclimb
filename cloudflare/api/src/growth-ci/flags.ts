/**
 * Server-side Growth CI rollout controls.
 *
 * Non-secret Worker vars. Staging should enable Growth CI; production stays
 * gated until the founder completes the real-app launch checklist.
 */

export type GrowthCiFlagName =
  | "GROWTH_CI_ENABLED"
  | "AGENT_BRIDGE_ENABLED"
  | "LEGACY_SURFACES_ENABLED";

export interface GrowthCiFlags {
  growthCiEnabled: boolean;
  agentBridgeEnabled: boolean;
  legacySurfacesEnabled: boolean;
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

/**
 * @param env Worker env (or partial vars map in tests)
 * @param defaults Prefer staging-like defaults in tests; production wrangler
 *   should set explicit values.
 */
export function readGrowthCiFlags(
  env: Partial<Record<GrowthCiFlagName, string | undefined>> | Cloudflare.Env,
  defaults: GrowthCiFlags = {
    growthCiEnabled: false,
    agentBridgeEnabled: false,
    legacySurfacesEnabled: false,
  },
): GrowthCiFlags {
  const record = env as Partial<Record<GrowthCiFlagName, string | undefined>>;
  return {
    growthCiEnabled: parseBool(record.GROWTH_CI_ENABLED, defaults.growthCiEnabled),
    agentBridgeEnabled: parseBool(
      record.AGENT_BRIDGE_ENABLED,
      defaults.agentBridgeEnabled,
    ),
    legacySurfacesEnabled: parseBool(
      record.LEGACY_SURFACES_ENABLED,
      defaults.legacySurfacesEnabled,
    ),
  };
}

export function isGrowthCiEnabled(env: Cloudflare.Env): boolean {
  return readGrowthCiFlags(env).growthCiEnabled;
}

export function isAgentBridgeEnabled(env: Cloudflare.Env): boolean {
  return readGrowthCiFlags(env).agentBridgeEnabled;
}

export function areLegacySurfacesEnabled(env: Cloudflare.Env): boolean {
  return readGrowthCiFlags(env).legacySurfacesEnabled;
}
