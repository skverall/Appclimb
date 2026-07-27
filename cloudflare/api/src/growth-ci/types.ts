export type ReleaseCheckMessage = {
  type: "release-check";
  checkId: string;
  workspaceId: string;
  appId: string;
  releaseId: string;
  queuedAt: string;
};

export const AGENT_SCOPES = [
  "tasks:read",
  "tasks:write",
  "releases:write",
  "verdicts:read",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface AgentAuthContext {
  tokenId: string;
  workspaceId: string;
  appId: string;
  scopes: AgentScope[];
  name: string;
}

export interface AppReleaseRow {
  id: string;
  workspace_id: string;
  app_id: string;
  version: string;
  build_number: string;
  source: string;
  source_trust: string;
  status: string;
  first_seen_at: string;
  reported_deployed_at: string | null;
  previous_release_id: string | null;
  commit_sha: string | null;
  previous_commit_sha: string | null;
  pull_request_url: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseCheckRow {
  id: string;
  workspace_id: string;
  app_id: string;
  release_id: string;
  status: string;
  verdict: string;
  attempt: number;
  max_attempts: number;
  locked_at: string | null;
  run_after: string;
  input_hash: string | null;
  contract_version: string;
  primary_metric_key: string | null;
  baseline_method: string | null;
  baseline_release_id: string | null;
  baseline_value: number | null;
  current_value: number | null;
  absolute_change: number | null;
  relative_change: number | null;
  baseline_sample: number | null;
  current_sample: number | null;
  p_value: number | null;
  confidence_score: number;
  confidence_level: string;
  baseline_window_from: string | null;
  baseline_window_to: string | null;
  current_window_from: string | null;
  current_window_to: string | null;
  evidence: string;
  supporting_signals: string;
  limitations: string;
  missing_requirements: string;
  error_code: string | null;
  next_check_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrowthIncidentRow {
  id: string;
  workspace_id: string;
  app_id: string;
  origin_release_id: string;
  origin_check_id: string;
  fix_release_id: string | null;
  verification_check_id: string | null;
  stage_id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  outcome: string | null;
  primary_metric_key: string;
  confidence_score: number;
  evidence_ids: string;
  action_plan: string;
  verification_contract: string;
  learning_record: string | null;
  dismissal_reason: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTaskRow {
  id: string;
  workspace_id: string;
  app_id: string;
  incident_id: string;
  status: string;
  task_packet: string;
  claimed_by: string | null;
  claimed_token_id: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  branch_name: string | null;
  commit_sha: string | null;
  pull_request_url: string | null;
  fix_release_id: string | null;
  submitted_at: string | null;
  deployed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
