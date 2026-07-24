package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrConflict       = errors.New("resource already exists")
	ErrNotFound       = errors.New("resource not found")
	ErrRefreshInvalid = errors.New("refresh token is invalid")
)

type Identity struct {
	UserID       string    `json:"userId"`
	Email        string    `json:"email"`
	WorkspaceID  string    `json:"workspaceId"`
	Workspace    string    `json:"workspaceName"`
	Role         string    `json:"role"`
	TrialEndsAt  time.Time `json:"trialEndsAt"`
	Subscription string    `json:"subscriptionStatus"`
}

type Workspace struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	SubscriptionStatus string     `json:"subscriptionStatus"`
	TrialEndsAt        time.Time  `json:"trialEndsAt"`
	EntitlementEndsAt  *time.Time `json:"entitlementEndsAt,omitempty"`
	DefaultAppID       string     `json:"defaultAppId"`
	DefaultAppName     string     `json:"defaultAppName"`
	DefaultStorefront  string     `json:"defaultStorefront"`
}

type Source struct {
	Provider       string     `json:"provider"`
	Status         string     `json:"status"`
	AccountLabel   string     `json:"accountLabel,omitempty"`
	LastVerifiedAt *time.Time `json:"lastVerifiedAt,omitempty"`
	LastSyncedAt   *time.Time `json:"lastSyncedAt,omitempty"`
	NextSyncAt     *time.Time `json:"nextSyncAt,omitempty"`
	LastErrorCode  string     `json:"lastErrorCode,omitempty"`
}

type SourceSecret struct {
	ID                 string
	WorkspaceID        string
	AppID              string
	Provider           string
	CredentialEnvelope json.RawMessage
}

type Metric struct {
	Provider     string
	Key          string
	OccurredAt   time.Time
	Value        float64
	Unit         string
	Freshness    float64
	Completeness float64
}

type ReplayEvent struct {
	ID         string         `json:"id"`
	OccurredAt time.Time      `json:"occurredAt"`
	Label      string         `json:"label"`
	Detail     string         `json:"detail"`
	Type       string         `json:"type"`
	Payload    map[string]any `json:"payload"`
}

type InsightRecord struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Kind        string   `json:"kind"`
	StageID     string   `json:"stageId"`
	EvidenceIDs []string `json:"evidenceIds"`
	Confidence  string   `json:"confidence"`
	Impact      string   `json:"impact"`
	Effort      string   `json:"effort"`
	Rank        int      `json:"rank"`
}

type EvidenceRecord struct {
	ID         string         `json:"id"`
	Provider   string         `json:"provider"`
	Title      string         `json:"title"`
	Finding    string         `json:"finding"`
	MetricKeys []string       `json:"metricKeys"`
	WindowFrom time.Time      `json:"windowFrom"`
	WindowTo   time.Time      `json:"windowTo"`
	Confidence string         `json:"confidence"`
	Before     map[string]any `json:"before"`
	After      map[string]any `json:"after"`
}

// ActionProposalRecord mirrors the action_proposals row the diagnosis generator
// writes. ExternalMutationAllowed is always false (DB CHECK forces it).
type ActionProposalRecord struct {
	ID                    string `json:"id"`
	InsightID             string `json:"insightId"`
	Title                 string `json:"title"`
	Rationale             string `json:"rationale"`
	ExperimentTemplate    string `json:"experimentTemplate"`
	Status                string `json:"status"`
	ExternalMutationAllowed bool  `json:"externalMutationAllowed"`
}

func (db *DB) CreateIdentity(
	ctx context.Context,
	email, passwordHash, workspaceName string,
) (Identity, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	workspaceName = strings.TrimSpace(workspaceName)
	if workspaceName == "" {
		workspaceName = "My AppClimb workspace"
	}
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return Identity{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var identity Identity
	if err := tx.QueryRow(
		ctx,
		`insert into users(email, password_hash)
		 values($1, $2)
		 returning id::text, email::text`,
		email,
		passwordHash,
	).Scan(&identity.UserID, &identity.Email); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Identity{}, ErrConflict
		}
		return Identity{}, err
	}
	identity.Role = "owner"
	identity.Workspace = workspaceName
	identity.Subscription = "trialing"
	if err := tx.QueryRow(
		ctx,
		`insert into workspaces(name, owner_id)
		 values($1, $2)
		 returning id::text, trial_ends_at`,
		workspaceName,
		identity.UserID,
	).Scan(&identity.WorkspaceID, &identity.TrialEndsAt); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(
		ctx,
		"insert into workspace_members(workspace_id, user_id, role) values($1,$2,'owner')",
		identity.WorkspaceID,
		identity.UserID,
	); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(
		ctx,
		"select set_config('app.workspace_id', $1, true)",
		identity.WorkspaceID,
	); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(
		ctx,
		`insert into apps(workspace_id, name, platform, default_storefront)
		 values($1, 'My iOS App', 'iOS', 'US')`,
		identity.WorkspaceID,
	); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(
		ctx,
		`insert into audit_events(workspace_id, actor_user_id, action, target_type, target_id)
		 values($1,$2,'workspace.created','workspace',$3)`,
		identity.WorkspaceID,
		identity.UserID,
		identity.WorkspaceID,
	); err != nil {
		return Identity{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Identity{}, err
	}
	return identity, nil
}

func (db *DB) Authenticate(ctx context.Context, email string) (Identity, string, error) {
	var identity Identity
	var passwordHash string
	err := db.Pool.QueryRow(
		ctx,
		`select
		   u.id::text,
		   u.email::text,
		   u.password_hash,
		   w.id::text,
		   w.name,
		   wm.role::text,
		   w.trial_ends_at,
		   w.subscription_status
		 from users u
		 join workspace_members wm on wm.user_id = u.id
		 join workspaces w on w.id = wm.workspace_id
		 where u.email = $1
		 order by wm.created_at
		 limit 1`,
		strings.ToLower(strings.TrimSpace(email)),
	).Scan(
		&identity.UserID,
		&identity.Email,
		&passwordHash,
		&identity.WorkspaceID,
		&identity.Workspace,
		&identity.Role,
		&identity.TrialEndsAt,
		&identity.Subscription,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, "", ErrNotFound
	}
	return identity, passwordHash, err
}

func (db *DB) Identity(ctx context.Context, userID, workspaceID string) (Identity, error) {
	var identity Identity
	err := db.Pool.QueryRow(
		ctx,
		`select
		   u.id::text,
		   u.email::text,
		   w.id::text,
		   w.name,
		   wm.role::text,
		   w.trial_ends_at,
		   w.subscription_status
		 from users u
		 join workspace_members wm on wm.user_id = u.id
		 join workspaces w on w.id = wm.workspace_id
		 where u.id = $1 and w.id = $2`,
		userID,
		workspaceID,
	).Scan(
		&identity.UserID,
		&identity.Email,
		&identity.WorkspaceID,
		&identity.Workspace,
		&identity.Role,
		&identity.TrialEndsAt,
		&identity.Subscription,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, ErrNotFound
	}
	return identity, err
}

func (db *DB) Workspace(ctx context.Context, userID, workspaceID string) (Workspace, error) {
	var result Workspace
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		return tx.QueryRow(
			ctx,
			`select
			   w.id::text,
			   w.name,
			   w.subscription_status,
			   w.trial_ends_at,
			   w.entitlement_ends_at,
			   a.id::text,
			   a.name,
			   a.default_storefront
			 from workspaces w
			 join workspace_members wm on wm.workspace_id = w.id
			 join apps a on a.workspace_id = w.id
			 where w.id = $1 and wm.user_id = $2
			 order by a.created_at
			 limit 1`,
			workspaceID,
			userID,
		).Scan(
			&result.ID,
			&result.Name,
			&result.SubscriptionStatus,
			&result.TrialEndsAt,
			&result.EntitlementEndsAt,
			&result.DefaultAppID,
			&result.DefaultAppName,
			&result.DefaultStorefront,
		)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Workspace{}, ErrNotFound
	}
	return result, err
}

func (db *DB) CreateRefreshSession(
	ctx context.Context,
	identity Identity,
	familyID string,
	tokenHash []byte,
	expiresAt time.Time,
) error {
	if familyID == "" {
		familyID = uuid.NewString()
	}
	_, err := db.Pool.Exec(
		ctx,
		`insert into refresh_sessions(
		   family_id, user_id, workspace_id, token_hash, expires_at
		 ) values($1,$2,$3,$4,$5)`,
		familyID,
		identity.UserID,
		identity.WorkspaceID,
		tokenHash,
		expiresAt,
	)
	return err
}

func (db *DB) RotateRefreshSession(
	ctx context.Context,
	oldHash, newHash []byte,
	newExpiry time.Time,
) (Identity, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return Identity{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var sessionID, familyID, userID, workspaceID string
	var expiresAt time.Time
	var rotatedAt, revokedAt *time.Time
	err = tx.QueryRow(
		ctx,
		`select
		   id::text,
		   family_id::text,
		   user_id::text,
		   workspace_id::text,
		   expires_at,
		   rotated_at,
		   revoked_at
		 from refresh_sessions
		 where token_hash = $1
		 for update`,
		oldHash,
	).Scan(
		&sessionID,
		&familyID,
		&userID,
		&workspaceID,
		&expiresAt,
		&rotatedAt,
		&revokedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, ErrRefreshInvalid
	}
	if err != nil {
		return Identity{}, err
	}
	if rotatedAt != nil || revokedAt != nil || time.Now().UTC().After(expiresAt) {
		if _, revokeErr := tx.Exec(
			ctx,
			"update refresh_sessions set revoked_at=coalesce(revoked_at,now()) where family_id=$1",
			familyID,
		); revokeErr != nil {
			return Identity{}, revokeErr
		}
		if err := tx.Commit(ctx); err != nil {
			return Identity{}, err
		}
		return Identity{}, ErrRefreshInvalid
	}
	if _, err := tx.Exec(
		ctx,
		"update refresh_sessions set rotated_at=now() where id=$1",
		sessionID,
	); err != nil {
		return Identity{}, err
	}
	if _, err := tx.Exec(
		ctx,
		`insert into refresh_sessions(
		   family_id, user_id, workspace_id, token_hash, expires_at
		 ) values($1,$2,$3,$4,$5)`,
		familyID,
		userID,
		workspaceID,
		newHash,
		newExpiry,
	); err != nil {
		return Identity{}, err
	}
	var identity Identity
	if err := tx.QueryRow(
		ctx,
		`select
		   u.id::text,
		   u.email::text,
		   w.id::text,
		   w.name,
		   wm.role::text,
		   w.trial_ends_at,
		   w.subscription_status
		 from users u
		 join workspace_members wm on wm.user_id=u.id
		 join workspaces w on w.id=wm.workspace_id
		 where u.id=$1 and w.id=$2`,
		userID,
		workspaceID,
	).Scan(
		&identity.UserID,
		&identity.Email,
		&identity.WorkspaceID,
		&identity.Workspace,
		&identity.Role,
		&identity.TrialEndsAt,
		&identity.Subscription,
	); err != nil {
		return Identity{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Identity{}, err
	}
	return identity, nil
}

func (db *DB) RevokeRefreshSession(ctx context.Context, tokenHash []byte) error {
	_, err := db.Pool.Exec(
		ctx,
		`update refresh_sessions
		 set revoked_at=coalesce(revoked_at,now())
		 where family_id=(
		   select family_id from refresh_sessions where token_hash=$1
		 )`,
		tokenHash,
	)
	return err
}

func (db *DB) DeleteAccount(ctx context.Context, userID, workspaceID string) error {
	result, err := db.Pool.Exec(
		ctx,
		`delete from users u
		 using workspace_members wm
		 where u.id=$1 and wm.user_id=u.id and wm.workspace_id=$2`,
		userID,
		workspaceID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (db *DB) ListSources(ctx context.Context, workspaceID string) ([]Source, error) {
	result := make([]Source, 0, 5)
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		rows, err := tx.Query(
			ctx,
			`select
			   provider::text,
			   status,
			   coalesce(account_label,''),
			   last_verified_at,
			   last_synced_at,
			   next_sync_at,
			   coalesce(last_error_code,'')
			 from source_connections
			 where workspace_id=$1
			 order by provider`,
			workspaceID,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var source Source
			if err := rows.Scan(
				&source.Provider,
				&source.Status,
				&source.AccountLabel,
				&source.LastVerifiedAt,
				&source.LastSyncedAt,
				&source.NextSyncAt,
				&source.LastErrorCode,
			); err != nil {
				return err
			}
			result = append(result, source)
		}
		return rows.Err()
	})
	return result, err
}

func (db *DB) UpsertSource(
	ctx context.Context,
	workspaceID, provider, accountLabel string,
	envelope json.RawMessage,
	verifiedAt time.Time,
) (Source, error) {
	var source Source
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		var appID string
		if err := tx.QueryRow(
			ctx,
			"select id::text from apps where workspace_id=$1 order by created_at limit 1",
			workspaceID,
		).Scan(&appID); err != nil {
			return err
		}
		return tx.QueryRow(
			ctx,
			`insert into source_connections(
			   workspace_id,
			   app_id,
			   provider,
			   status,
			   credential_envelope,
			   account_label,
			   last_verified_at,
			   next_sync_at,
			   last_error_code
			 ) values($1,$2,$3,'connected',$4,$5,$6,now(),null)
			 on conflict(workspace_id,provider) do update set
			   app_id=excluded.app_id,
			   status='connected',
			   credential_envelope=excluded.credential_envelope,
			   account_label=excluded.account_label,
			   last_verified_at=excluded.last_verified_at,
			   next_sync_at=now(),
			   last_error_code=null,
			   updated_at=now()
			 returning
			   provider::text,
			   status,
			   coalesce(account_label,''),
			   last_verified_at,
			   last_synced_at,
			   next_sync_at,
			   coalesce(last_error_code,'')`,
			workspaceID,
			appID,
			provider,
			envelope,
			accountLabel,
			verifiedAt,
		).Scan(
			&source.Provider,
			&source.Status,
			&source.AccountLabel,
			&source.LastVerifiedAt,
			&source.LastSyncedAt,
			&source.NextSyncAt,
			&source.LastErrorCode,
		)
	})
	return source, err
}

func (db *DB) DeleteSource(ctx context.Context, workspaceID, provider string) error {
	return db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		result, err := tx.Exec(
			ctx,
			"delete from source_connections where workspace_id=$1 and provider=$2",
			workspaceID,
			provider,
		)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func (db *DB) QueueSourceSync(
	ctx context.Context,
	workspaceID, provider string,
	from, to time.Time,
) (string, error) {
	var jobID string
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		return tx.QueryRow(
			ctx,
			`insert into sync_jobs(
			   workspace_id,
			   connection_id,
			   provider,
			   window_from,
			   window_to
			 )
			 select workspace_id,id,provider,$3,$4
			 from source_connections
			 where workspace_id=$1 and provider=$2 and status='connected'
			 returning id::text`,
			workspaceID,
			provider,
			from,
			to,
		).Scan(&jobID)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return jobID, err
}

func (db *DB) GrowthInputs(
	ctx context.Context,
	workspaceID string,
	from time.Time,
) (Workspace, []Metric, []ReplayEvent, []InsightRecord, []EvidenceRecord, []ActionProposalRecord, error) {
	var workspace Workspace
	metrics := []Metric{}
	events := []ReplayEvent{}
	insights := []InsightRecord{}
	evidence := []EvidenceRecord{}
	actions := []ActionProposalRecord{}
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(
			ctx,
			`select
			   w.id::text,w.name,w.subscription_status,w.trial_ends_at,
			   w.entitlement_ends_at,a.id::text,a.name,a.default_storefront
			 from workspaces w
			 join apps a on a.workspace_id=w.id
			 where w.id=$1
			 order by a.created_at limit 1`,
			workspaceID,
		).Scan(
			&workspace.ID,
			&workspace.Name,
			&workspace.SubscriptionStatus,
			&workspace.TrialEndsAt,
			&workspace.EntitlementEndsAt,
			&workspace.DefaultAppID,
			&workspace.DefaultAppName,
			&workspace.DefaultStorefront,
		); err != nil {
			return err
		}
		metricRows, err := tx.Query(
			ctx,
			`select
			   provider::text,
			   metric_key,
			   occurred_at,
			   value::float8,
			   unit,
			   freshness_hours::float8,
			   completeness::float8
			 from metric_points
			 where workspace_id=$1 and app_id=$2 and occurred_at >= $3
			 order by occurred_at`,
			workspaceID,
			workspace.DefaultAppID,
			from,
		)
		if err != nil {
			return err
		}
		for metricRows.Next() {
			var metric Metric
			if err := metricRows.Scan(
				&metric.Provider,
				&metric.Key,
				&metric.OccurredAt,
				&metric.Value,
				&metric.Unit,
				&metric.Freshness,
				&metric.Completeness,
			); err != nil {
				metricRows.Close()
				return err
			}
			metrics = append(metrics, metric)
		}
		if err := metricRows.Err(); err != nil {
			metricRows.Close()
			return err
		}
		metricRows.Close()

		eventRows, err := tx.Query(
			ctx,
			`select id::text,occurred_at,label,coalesce(detail,''),event_type,payload
			 from change_events
			 where workspace_id=$1 and app_id=$2 and occurred_at >= $3
			 order by occurred_at`,
			workspaceID,
			workspace.DefaultAppID,
			from,
		)
		if err != nil {
			return err
		}
		for eventRows.Next() {
			var item ReplayEvent
			if err := eventRows.Scan(
				&item.ID,
				&item.OccurredAt,
				&item.Label,
				&item.Detail,
				&item.Type,
				&item.Payload,
			); err != nil {
				eventRows.Close()
				return err
			}
			events = append(events, item)
		}
		if err := eventRows.Err(); err != nil {
			eventRows.Close()
			return err
		}
		eventRows.Close()

		insightRows, err := tx.Query(
			ctx,
			`select
			   id::text,title,summary,kind::text,stage_id,
			   array(select unnest(evidence_ids)::text),
			   confidence::text,impact,effort,rank
			 from insights
			 where workspace_id=$1 and app_id=$2
			 order by created_at desc,rank
			 limit 3`,
			workspaceID,
			workspace.DefaultAppID,
		)
		if err != nil {
			return err
		}
		for insightRows.Next() {
			var item InsightRecord
			if err := insightRows.Scan(
				&item.ID,
				&item.Title,
				&item.Summary,
				&item.Kind,
				&item.StageID,
				&item.EvidenceIDs,
				&item.Confidence,
				&item.Impact,
				&item.Effort,
				&item.Rank,
			); err != nil {
				insightRows.Close()
				return err
			}
			insights = append(insights, item)
		}
		if err := insightRows.Err(); err != nil {
			insightRows.Close()
			return err
		}
		insightRows.Close()

		evidenceRows, err := tx.Query(
			ctx,
			`select
			   id::text,provider::text,title,finding,metric_keys,
			   window_from,window_to,confidence::text,before_value,after_value
			 from evidence
			 where workspace_id=$1 and app_id=$2
			 order by created_at desc
			 limit 12`,
			workspaceID,
			workspace.DefaultAppID,
		)
		if err != nil {
			return err
		}
		defer evidenceRows.Close()
		for evidenceRows.Next() {
			var item EvidenceRecord
			if err := evidenceRows.Scan(
				&item.ID,
				&item.Provider,
				&item.Title,
				&item.Finding,
				&item.MetricKeys,
				&item.WindowFrom,
				&item.WindowTo,
				&item.Confidence,
				&item.Before,
				&item.After,
			); err != nil {
				return err
			}
			evidence = append(evidence, item)
		}
		if err := evidenceRows.Err(); err != nil {
			return err
		}
		evidenceRows.Close()

		actionRows, err := tx.Query(
			ctx,
			`select
			   id::text,
			   insight_id::text,
			   title,
			   rationale,
			   experiment_template,
			   status,
			   external_mutation_allowed
			 from action_proposals
			 where workspace_id=$1 and app_id=$2
			 order by created_at desc
			 limit 9`,
			workspaceID,
			workspace.DefaultAppID,
		)
		if err != nil {
			return err
		}
		for actionRows.Next() {
			var item ActionProposalRecord
			if err := actionRows.Scan(
				&item.ID,
				&item.InsightID,
				&item.Title,
				&item.Rationale,
				&item.ExperimentTemplate,
				&item.Status,
				&item.ExternalMutationAllowed,
			); err != nil {
				actionRows.Close()
				return err
			}
			actions = append(actions, item)
		}
		if err := actionRows.Err(); err != nil {
			actionRows.Close()
			return err
		}
		actionRows.Close()
		return nil
	})
	return workspace, metrics, events, insights, evidence, actions, err
}

func (db *DB) RecordBillingEvent(
	ctx context.Context,
	eventID, eventType string,
	occurredAt time.Time,
	payload json.RawMessage,
	workspaceID, subscriptionID, status string,
	entitlementEndsAt *time.Time,
) (bool, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(
		ctx,
		`insert into billing_events(
		   paddle_event_id,event_type,occurred_at,payload
		 ) values($1,$2,$3,$4)
		 on conflict(paddle_event_id) do nothing`,
		eventID,
		eventType,
		occurredAt,
		payload,
	)
	if err != nil {
		return false, err
	}
	inserted := result.RowsAffected() == 1
	if inserted && workspaceID != "" && strings.HasPrefix(eventType, "subscription.") {
		if _, err := tx.Exec(
			ctx,
			`update workspaces set
			   paddle_subscription_id=nullif($2,''),
			   subscription_status=coalesce(nullif($3,''),subscription_status),
			   entitlement_ends_at=$4,
			   updated_at=now()
			 where id=$1`,
			workspaceID,
			subscriptionID,
			status,
			entitlementEndsAt,
		); err != nil {
			return false, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return inserted, nil
}

func (db *DB) Ping(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

func (db *DB) Audit(
	ctx context.Context,
	workspaceID, userID, action, targetType, targetID string,
	metadata map[string]any,
) error {
	return db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		_, err := tx.Exec(
			ctx,
			`insert into audit_events(
			   workspace_id,actor_user_id,action,target_type,target_id,metadata
			 ) values($1,$2,$3,$4,nullif($5,''),$6)`,
			workspaceID,
			userID,
			action,
			targetType,
			targetID,
			metadata,
		)
		return err
	})
}

func Wrap(label string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", label, err)
}
