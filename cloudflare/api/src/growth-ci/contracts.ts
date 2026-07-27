import {
  DEFAULT_GROWTH_CONTRACT,
  GROWTH_CONTRACT_VERSION,
  type GrowthContractThresholds,
} from "../release-impact/config";
import { nowISO } from "../runtime";

export interface GrowthContractRow {
  id: string;
  workspace_id: string;
  app_id: string;
  schema_version: number;
  contract_version: string;
  session_event: string;
  activation_event: string;
  version_property: string;
  build_property: string;
  version_property_status: string;
  version_property_confirmed_at: string | null;
  first_observed_version: string | null;
  last_observed_version: string | null;
  activation_window_days: number;
  minimum_new_users: number;
  maximum_collection_days: number;
  minimum_complete_days: number;
  regression_absolute_drop: number;
  regression_relative_drop: number;
  regression_p_value: number;
  improvement_absolute_gain: number;
  improvement_relative_gain: number;
  improvement_p_value: number;
  guardrail_trial_to_paid_max_relative_drop: number;
  guardrail_renewal_rate_max_relative_drop: number;
  free_verdict_consumed_at: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export function thresholdsFromRow(row: GrowthContractRow): GrowthContractThresholds {
  return {
    schemaVersion: row.schema_version,
    contractVersion: row.contract_version,
    activationWindowDays: row.activation_window_days,
    minimumNewUsers: row.minimum_new_users,
    maximumCollectionDays: row.maximum_collection_days,
    minimumCompleteDays: row.minimum_complete_days,
    regression: {
      minimumAbsoluteDrop: row.regression_absolute_drop,
      minimumRelativeDrop: row.regression_relative_drop,
      pValueThreshold: row.regression_p_value,
    },
    improvement: {
      minimumAbsoluteGain: row.improvement_absolute_gain,
      minimumRelativeGain: row.improvement_relative_gain,
      pValueThreshold: row.improvement_p_value,
    },
    guardrails: {
      trialToPaid: {
        maximumRelativeDrop: row.guardrail_trial_to_paid_max_relative_drop,
      },
      renewalRate: {
        maximumRelativeDrop: row.guardrail_renewal_rate_max_relative_drop,
      },
    },
    verificationRecoveryRatio: DEFAULT_GROWTH_CONTRACT.verificationRecoveryRatio,
    claimTimeoutMinutes: DEFAULT_GROWTH_CONTRACT.claimTimeoutMinutes,
  };
}

export async function ensureGrowthContract(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<GrowthContractRow> {
  const existing = await db
    .prepare(
      `SELECT * FROM growth_contracts WHERE workspace_id=? AND app_id=? LIMIT 1`,
    )
    .bind(workspaceId, appId)
    .first<GrowthContractRow>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const createdAt = nowISO();
  const d = DEFAULT_GROWTH_CONTRACT;
  await db
    .prepare(
      `INSERT INTO growth_contracts(
        id,workspace_id,app_id,schema_version,contract_version,
        activation_window_days,minimum_new_users,maximum_collection_days,
        minimum_complete_days,
        regression_absolute_drop,regression_relative_drop,regression_p_value,
        improvement_absolute_gain,improvement_relative_gain,improvement_p_value,
        guardrail_trial_to_paid_max_relative_drop,
        guardrail_renewal_rate_max_relative_drop,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      workspaceId,
      appId,
      d.schemaVersion,
      GROWTH_CONTRACT_VERSION,
      d.activationWindowDays,
      d.minimumNewUsers,
      d.maximumCollectionDays,
      d.minimumCompleteDays,
      d.regression.minimumAbsoluteDrop,
      d.regression.minimumRelativeDrop,
      d.regression.pValueThreshold,
      d.improvement.minimumAbsoluteGain,
      d.improvement.minimumRelativeGain,
      d.improvement.pValueThreshold,
      d.guardrails.trialToPaid.maximumRelativeDrop,
      d.guardrails.renewalRate.maximumRelativeDrop,
      createdAt,
      createdAt,
    )
    .run();

  const row = await db
    .prepare(`SELECT * FROM growth_contracts WHERE id=?`)
    .bind(id)
    .first<GrowthContractRow>();
  if (!row) throw new Error("growth_contract_create_failed");
  return row;
}

export async function updateContractMeasurement(
  db: D1Database,
  workspaceId: string,
  appId: string,
  patch: {
    sessionEvent?: string;
    activationEvent?: string;
    versionProperty?: string;
    buildProperty?: string;
    versionPropertyStatus?: string;
    versionPropertyConfirmedAt?: string | null;
    firstObservedVersion?: string | null;
    lastObservedVersion?: string | null;
    activationWindowDays?: number;
  },
): Promise<GrowthContractRow> {
  const row = await ensureGrowthContract(db, workspaceId, appId);
  const updatedAt = nowISO();
  await db
    .prepare(
      `UPDATE growth_contracts SET
        session_event=?,
        activation_event=?,
        version_property=?,
        build_property=?,
        version_property_status=?,
        version_property_confirmed_at=?,
        first_observed_version=?,
        last_observed_version=?,
        activation_window_days=?,
        updated_at=?
       WHERE id=? AND workspace_id=?`,
    )
    .bind(
      patch.sessionEvent ?? row.session_event,
      patch.activationEvent ?? row.activation_event,
      patch.versionProperty ?? row.version_property,
      patch.buildProperty ?? row.build_property,
      patch.versionPropertyStatus ?? row.version_property_status,
      patch.versionPropertyConfirmedAt !== undefined
        ? patch.versionPropertyConfirmedAt
        : row.version_property_confirmed_at,
      patch.firstObservedVersion !== undefined
        ? patch.firstObservedVersion
        : row.first_observed_version,
      patch.lastObservedVersion !== undefined
        ? patch.lastObservedVersion
        : row.last_observed_version,
      patch.activationWindowDays ?? row.activation_window_days,
      updatedAt,
      row.id,
      workspaceId,
    )
    .run();
  return (await ensureGrowthContract(db, workspaceId, appId));
}
