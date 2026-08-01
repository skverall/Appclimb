import { describe, expect, it } from "vitest";

import { reportManualRelease } from "./releases";
import {
  createTestEnvironment,
  seedWorkspace,
} from "../diagnosis/test-support";

describe("reportManualRelease", () => {
  it("records a user-reported release and queues the normal release check", async () => {
    const { db, env, queue } = createTestEnvironment();
    const seeded = seedWorkspace(db);

    const result = await reportManualRelease(env, {
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      appId: seeded.appId,
      version: "2.4.2",
      buildNumber: "42",
      reportedDeployedAt: "2026-08-02T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, taskLinked: false });
    if (!result.ok) return;

    expect(
      db.row<{ source: string; source_trust: string; status: string }>(
        "SELECT source,source_trust,status FROM app_releases WHERE id=?",
        result.releaseId,
      ),
    ).toEqual({
      source: "manual",
      source_trust: "user_assertion",
      status: "observed",
    });
    expect(
      db.row<{ status: string; release_id: string }>(
        "SELECT status,release_id FROM release_checks WHERE id=?",
        result.checkId,
      ),
    ).toMatchObject({ status: "queued", release_id: result.releaseId });
    expect(queue.sent).toContainEqual(
      expect.objectContaining({
        type: "release-check",
        checkId: result.checkId,
        releaseId: result.releaseId,
      }),
    );
    expect(
      db.rows<{ action: string }>("SELECT action FROM audit_events").some(
        (row) => row.action === "manual_release.reported",
      ),
    ).toBe(true);
  });

  it("does not allow a release to be linked to another workspace or closed task", async () => {
    const { db, env } = createTestEnvironment();
    const seeded = seedWorkspace(db);

    await expect(
      reportManualRelease(env, {
        workspaceId: seeded.workspaceId,
        userId: seeded.userId,
        appId: seeded.appId,
        version: "2.4.3",
        taskId: "missing-task",
      }),
    ).resolves.toEqual({ ok: false, code: "task_not_found" });

    await expect(
      reportManualRelease(env, {
        workspaceId: seeded.workspaceId,
        userId: seeded.userId,
        appId: "other-app",
        version: "2.4.3",
      }),
    ).resolves.toEqual({ ok: false, code: "app_not_found" });
  });

  it("moves a linked task into verification when the reported release is the fix", async () => {
    const { db, env } = createTestEnvironment();
    const seeded = seedWorkspace(db);
    const now = "2026-08-02T10:00:00.000Z";

    db.sqlite
      .prepare(
        `INSERT INTO app_releases(
          id,workspace_id,app_id,version,build_number,source,source_trust,status,
          first_seen_at,metadata,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,'evaluated',?,'{}',?,?)`,
      )
      .run(
        "origin-release",
        seeded.workspaceId,
        seeded.appId,
        "2.4.1",
        "41",
        "posthog",
        "verified_connector",
        now,
        now,
        now,
      );
    db.sqlite
      .prepare(
        `INSERT INTO release_checks(
          id,workspace_id,app_id,release_id,status,verdict,run_after,
          contract_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,'healthy',?,?,?,?)`,
      )
      .run(
        "origin-check",
        seeded.workspaceId,
        seeded.appId,
        "origin-release",
        "succeeded",
        now,
        "1.0.0",
        now,
        now,
      );
    db.sqlite
      .prepare(
        `INSERT INTO growth_incidents(
          id,workspace_id,app_id,origin_release_id,origin_check_id,stage_id,
          title,summary,severity,status,primary_metric_key,confidence_score,
          action_plan,verification_contract,opened_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,'open',?,?,?, ?,?,?,?)`,
      )
      .run(
        "incident-1",
        seeded.workspaceId,
        seeded.appId,
        "origin-release",
        "origin-check",
        "activation",
        "Activation regressed",
        "Activation fell after the release.",
        "important",
        "activation_rate",
        90,
        "{}",
        "{}",
        now,
        now,
        now,
      );
    db.sqlite
      .prepare(
        `INSERT INTO agent_tasks(
          id,workspace_id,app_id,incident_id,status,task_packet,created_at,updated_at
        ) VALUES(?,?,?,?,?,'{}',?,?)`,
      )
      .run(
        "task-1",
        seeded.workspaceId,
        seeded.appId,
        "incident-1",
        "available",
        now,
        now,
      );

    const result = await reportManualRelease(env, {
      workspaceId: seeded.workspaceId,
      userId: seeded.userId,
      appId: seeded.appId,
      version: "2.4.2",
      buildNumber: "42",
      taskId: "task-1",
      reportedDeployedAt: now,
    });

    expect(result).toMatchObject({ ok: true, taskLinked: true });
    expect(
      db.row<{ status: string; fix_release_id: string }>(
        "SELECT status,fix_release_id FROM agent_tasks WHERE id='task-1'",
      ),
    ).toMatchObject({ status: "deployed" });
    expect(
      db.row<{ status: string; fix_release_id: string }>(
        "SELECT status,fix_release_id FROM growth_incidents WHERE id='incident-1'",
      ),
    ).toMatchObject({ status: "awaiting_verification" });
  });
});
