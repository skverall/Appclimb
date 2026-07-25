package database

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"strings"
	"time"

	"appclimb.app/backend/internal/webanalytics"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrPropertyDomainMismatch = errors.New(
	"web analytics property domain does not match",
)

type WebProperty struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Domain        string    `json:"domain"`
	TrackingToken string    `json:"trackingToken,omitempty"`
	TokenVersion  int       `json:"tokenVersion"`
	RetentionDays int       `json:"retentionDays"`
	CreatedAt     time.Time `json:"createdAt"`
}

type WebEventInput struct {
	EventID        string
	Kind           string
	VisitorID      string
	SessionID      string
	OccurredAt     time.Time
	Hostname       string
	Path           string
	ReferrerHost   string
	Source         string
	Channel        string
	UTMSource      string
	UTMMedium      string
	UTMCampaign    string
	UTMTerm        string
	UTMContent     string
	CountryCode    string
	Browser        string
	OS             string
	Device         string
	DurationMS     *int
	ConversionGoal string
}

type WebCrawlerEventInput struct {
	EventID     string
	OccurredAt  time.Time
	Hostname    string
	Path        string
	Provider    string
	Agent       string
	Category    string
	CountryCode string
}

type WebTotals struct {
	Visitors   int     `json:"visitors"`
	Sessions   int     `json:"sessions"`
	Pageviews  int     `json:"pageviews"`
	Engaged    int     `json:"engaged"`
	Converted  int     `json:"converted"`
	Online     int     `json:"online"`
	SessionSec float64 `json:"averageSessionSeconds"`
}

type WebSeriesPoint struct {
	Date      string `json:"date"`
	Visitors  int    `json:"visitors"`
	Engaged   int    `json:"engaged"`
	Converted int    `json:"converted"`
}

type WebBreakdownRow struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Detail      string  `json:"detail,omitempty"`
	Visitors    int     `json:"visitors"`
	EngagedRate float64 `json:"engagedRate"`
	Conversions int     `json:"conversions"`
}

type WebPageRow struct {
	Path           string  `json:"path"`
	Visitors       int     `json:"visitors"`
	ConversionRate float64 `json:"conversionRate"`
}

type WebVisitorRow struct {
	ID          string    `json:"id"`
	Alias       string    `json:"alias"`
	CountryCode string    `json:"countryCode,omitempty"`
	Browser     string    `json:"browser"`
	OS          string    `json:"os"`
	Device      string    `json:"device"`
	Channel     string    `json:"channel"`
	Source      string    `json:"source"`
	LastSeen    time.Time `json:"lastSeen"`
	Journey     []string  `json:"journey"`
	Converted   bool      `json:"converted"`
}

type WebCrawlerProvider struct {
	Provider string  `json:"provider"`
	Requests int     `json:"requests"`
	Share    float64 `json:"share"`
}

type WebCrawlerPage struct {
	Path     string `json:"path"`
	Requests int    `json:"requests"`
}

type WebCrawlerCategory struct {
	Category string `json:"category"`
	Requests int    `json:"requests"`
}

type WebCrawlerSnapshot struct {
	Requests       int                  `json:"requests"`
	Verified       int                  `json:"verified"`
	Series         []WebCrawlerSeries   `json:"series"`
	Providers      []WebCrawlerProvider `json:"providers"`
	Pages          []WebCrawlerPage     `json:"pages"`
	Categories     []WebCrawlerCategory `json:"categories"`
	DetectionLabel string               `json:"detectionLabel"`
}

type WebCrawlerSeries struct {
	Date     string `json:"date"`
	Category string `json:"category"`
	Requests int    `json:"requests"`
}

type WebAnalyticsSnapshot struct {
	GeneratedAt  time.Time          `json:"generatedAt"`
	Property     *WebProperty       `json:"property,omitempty"`
	Totals       WebTotals          `json:"totals"`
	Series       []WebSeriesPoint   `json:"series"`
	Channels     []WebBreakdownRow  `json:"channels"`
	Referrers    []WebBreakdownRow  `json:"referrers"`
	Campaigns    []WebBreakdownRow  `json:"campaigns"`
	UTMSources   []WebBreakdownRow  `json:"utmSources"`
	LandingPages []WebPageRow       `json:"landingPages"`
	Visitors     []WebVisitorRow    `json:"visitors"`
	Crawlers     WebCrawlerSnapshot `json:"crawlers"`
}

func (db *DB) CreateWebProperty(
	ctx context.Context,
	workspaceID, name, domain string,
) (WebProperty, error) {
	name = strings.TrimSpace(name)
	domain = webanalytics.NormalizeHostname(domain)
	var property WebProperty
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		return tx.QueryRow(
			ctx,
			`insert into web_properties(
			   workspace_id,
			   app_id,
			   name,
			   domain
			 )
			 values(
			   $1,
			   (select id from apps
			    where workspace_id=$1
			    order by created_at
			    limit 1),
			   $2,
			   $3
			 )
			 returning
			   id::text,
			   name,
			   domain::text,
			   token_version,
			   retention_days,
			   created_at`,
			workspaceID,
			name,
			domain,
		).Scan(
			&property.ID,
			&property.Name,
			&property.Domain,
			&property.TokenVersion,
			&property.RetentionDays,
			&property.CreatedAt,
		)
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return WebProperty{}, ErrConflict
		}
		return WebProperty{}, err
	}
	return property, nil
}

func (db *DB) WebProperty(
	ctx context.Context,
	workspaceID string,
) (WebProperty, error) {
	var property WebProperty
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		return tx.QueryRow(
			ctx,
			`select
			   id::text,
			   name,
			   domain::text,
			   token_version,
			   retention_days,
			   created_at
			 from web_properties
			 where workspace_id=$1`,
			workspaceID,
		).Scan(
			&property.ID,
			&property.Name,
			&property.Domain,
			&property.TokenVersion,
			&property.RetentionDays,
			&property.CreatedAt,
		)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return WebProperty{}, ErrNotFound
	}
	return property, err
}

func (db *DB) RecordWebEvent(
	ctx context.Context,
	claims webanalytics.TokenClaims,
	input WebEventInput,
) (bool, error) {
	inserted := false
	err := db.WithWorkspace(ctx, claims.WorkspaceID, func(tx pgx.Tx) error {
		var domain string
		var version int
		if err := tx.QueryRow(
			ctx,
			`select domain::text, token_version
			 from web_properties
			 where id=$1 and workspace_id=$2`,
			claims.PropertyID,
			claims.WorkspaceID,
		).Scan(&domain, &version); err != nil {
			return err
		}
		if version != claims.Version ||
			!webanalytics.HostMatchesProperty(input.Hostname, domain) {
			return ErrPropertyDomainMismatch
		}
		tag, err := tx.Exec(
			ctx,
			`insert into web_events(
			   workspace_id,
			   property_id,
			   event_id,
			   kind,
			   visitor_id,
			   session_id,
			   occurred_at,
			   hostname,
			   path,
			   referrer_host,
			   source,
			   channel,
			   utm_source,
			   utm_medium,
			   utm_campaign,
			   utm_term,
			   utm_content,
			   country_code,
			   browser,
			   operating_system,
			   device,
			   duration_ms,
			   goal
			 )
			 values(
			   $1,$2,$3,$4,$5,$6,$7,$8,$9,
			   nullif($10,''),
			   $11,$12,
			   nullif($13,''),
			   nullif($14,''),
			   nullif($15,''),
			   nullif($16,''),
			   nullif($17,''),
			   nullif($18,''),
			   $19,$20,$21,$22,
			   nullif($23,'')
			 )
			 on conflict(property_id, event_id) do nothing`,
			claims.WorkspaceID,
			claims.PropertyID,
			input.EventID,
			input.Kind,
			input.VisitorID,
			input.SessionID,
			input.OccurredAt,
			webanalytics.NormalizeHostname(input.Hostname),
			input.Path,
			input.ReferrerHost,
			input.Source,
			input.Channel,
			input.UTMSource,
			input.UTMMedium,
			input.UTMCampaign,
			input.UTMTerm,
			input.UTMContent,
			input.CountryCode,
			input.Browser,
			input.OS,
			input.Device,
			input.DurationMS,
			input.ConversionGoal,
		)
		if err != nil {
			return err
		}
		inserted = tag.RowsAffected() == 1
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return inserted, err
}

func (db *DB) RecordWebCrawlerEvent(
	ctx context.Context,
	claims webanalytics.TokenClaims,
	input WebCrawlerEventInput,
) (bool, error) {
	inserted := false
	err := db.WithWorkspace(ctx, claims.WorkspaceID, func(tx pgx.Tx) error {
		var domain string
		var version int
		if err := tx.QueryRow(
			ctx,
			`select domain::text, token_version
			 from web_properties
			 where id=$1 and workspace_id=$2`,
			claims.PropertyID,
			claims.WorkspaceID,
		).Scan(&domain, &version); err != nil {
			return err
		}
		if version != claims.Version ||
			!webanalytics.HostMatchesProperty(input.Hostname, domain) {
			return ErrPropertyDomainMismatch
		}
		tag, err := tx.Exec(
			ctx,
			`insert into web_crawler_events(
			   workspace_id,
			   property_id,
			   event_id,
			   occurred_at,
			   hostname,
			   path,
			   provider,
			   agent,
			   category,
			   detection_method,
			   country_code
			 )
			 values(
			   $1,$2,$3,$4,$5,$6,$7,$8,$9,'user_agent',nullif($10,'')
			 )
			 on conflict(property_id, event_id) do nothing`,
			claims.WorkspaceID,
			claims.PropertyID,
			input.EventID,
			input.OccurredAt,
			webanalytics.NormalizeHostname(input.Hostname),
			input.Path,
			input.Provider,
			input.Agent,
			input.Category,
			input.CountryCode,
		)
		if err != nil {
			return err
		}
		inserted = tag.RowsAffected() == 1
		return nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return inserted, err
}

func (db *DB) WebAnalytics(
	ctx context.Context,
	workspaceID string,
	now time.Time,
	windowDays int,
) (WebAnalyticsSnapshot, error) {
	snapshot := WebAnalyticsSnapshot{
		GeneratedAt:  now,
		Series:       []WebSeriesPoint{},
		Channels:     []WebBreakdownRow{},
		Referrers:    []WebBreakdownRow{},
		Campaigns:    []WebBreakdownRow{},
		UTMSources:   []WebBreakdownRow{},
		LandingPages: []WebPageRow{},
		Visitors:     []WebVisitorRow{},
		Crawlers: WebCrawlerSnapshot{
			Series:         []WebCrawlerSeries{},
			Providers:      []WebCrawlerProvider{},
			Pages:          []WebCrawlerPage{},
			Categories:     []WebCrawlerCategory{},
			DetectionLabel: "User-agent detected",
		},
	}
	from := now.AddDate(0, 0, -windowDays)
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		property, err := scanWebProperty(ctx, tx, workspaceID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		snapshot.Property = &property
		if err := loadWebTotals(
			ctx,
			tx,
			property.ID,
			from,
			now,
			&snapshot.Totals,
		); err != nil {
			return err
		}
		if snapshot.Series, err = loadWebSeries(
			ctx,
			tx,
			property.ID,
			from,
			now,
		); err != nil {
			return err
		}
		if snapshot.Channels, err = loadWebBreakdown(
			ctx, tx, property.ID, from, now, "channel",
		); err != nil {
			return err
		}
		if snapshot.Referrers, err = loadWebBreakdown(
			ctx, tx, property.ID, from, now, "referrer_host",
		); err != nil {
			return err
		}
		if snapshot.Campaigns, err = loadWebBreakdown(
			ctx, tx, property.ID, from, now, "utm_campaign",
		); err != nil {
			return err
		}
		if snapshot.UTMSources, err = loadWebBreakdown(
			ctx, tx, property.ID, from, now, "utm_source",
		); err != nil {
			return err
		}
		if snapshot.LandingPages, err = loadLandingPages(
			ctx, tx, property.ID, from, now,
		); err != nil {
			return err
		}
		if snapshot.Visitors, err = loadWebVisitors(
			ctx, tx, property.ID, from, now,
		); err != nil {
			return err
		}
		return loadCrawlerSnapshot(
			ctx,
			tx,
			property.ID,
			from,
			now,
			&snapshot.Crawlers,
		)
	})
	return snapshot, err
}

func scanWebProperty(
	ctx context.Context,
	tx pgx.Tx,
	workspaceID string,
) (WebProperty, error) {
	var property WebProperty
	err := tx.QueryRow(
		ctx,
		`select
		   id::text,
		   name,
		   domain::text,
		   token_version,
		   retention_days,
		   created_at
		 from web_properties
		 where workspace_id=$1`,
		workspaceID,
	).Scan(
		&property.ID,
		&property.Name,
		&property.Domain,
		&property.TokenVersion,
		&property.RetentionDays,
		&property.CreatedAt,
	)
	return property, err
}

func loadWebTotals(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
	totals *WebTotals,
) error {
	return tx.QueryRow(
		ctx,
		`with sessions as (
		   select
		     session_id,
		     visitor_id,
		     count(*) filter(where kind='page_view') as pageviews,
		     coalesce(max(duration_ms), 0) as duration_ms,
		     bool_or(kind='conversion') as converted,
		     max(occurred_at) as last_seen
		   from web_events
		   where property_id=$1
		     and occurred_at >= $2
		     and occurred_at <= $3
		   group by session_id, visitor_id
		 )
		 select
		   count(distinct visitor_id)::int,
		   count(*)::int,
		   coalesce(sum(pageviews),0)::int,
		   count(*) filter(
		     where pageviews > 1 or duration_ms >= 10000
		   )::int,
		   count(*) filter(where converted)::int,
		   count(*) filter(
		     where last_seen >= $3 - interval '5 minutes'
		   )::int,
		   coalesce(avg(duration_ms) / 1000.0, 0)::float8
		 from sessions`,
		propertyID,
		from,
		now,
	).Scan(
		&totals.Visitors,
		&totals.Sessions,
		&totals.Pageviews,
		&totals.Engaged,
		&totals.Converted,
		&totals.Online,
		&totals.SessionSec,
	)
}

func loadWebSeries(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
) ([]WebSeriesPoint, error) {
	rows, err := tx.Query(
		ctx,
		`with daily_visitors as (
		   select
		     occurred_at::date as day,
		     visitor_id,
		     count(*) filter(where kind='page_view') as pageviews,
		     coalesce(max(duration_ms),0) as duration_ms,
		     bool_or(kind='conversion') as converted
		   from web_events
		   where property_id=$1
		     and occurred_at >= $2
		     and occurred_at <= $3
		   group by occurred_at::date, visitor_id
		 )
		 select
		   day::text,
		   count(*)::int,
		   count(*) filter(
		     where pageviews > 1 or duration_ms >= 10000
		   )::int,
		   count(*) filter(where converted)::int
		 from daily_visitors
		 group by day
		 order by day`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []WebSeriesPoint{}
	for rows.Next() {
		var item WebSeriesPoint
		if err := rows.Scan(
			&item.Date,
			&item.Visitors,
			&item.Engaged,
			&item.Converted,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func loadWebBreakdown(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
	column string,
) ([]WebBreakdownRow, error) {
	allowed := map[string]bool{
		"channel":       true,
		"referrer_host": true,
		"utm_campaign":  true,
		"utm_source":    true,
	}
	if !allowed[column] {
		return nil, fmt.Errorf("unsupported web breakdown: %s", column)
	}
	query := fmt.Sprintf(
		`with session_stats as (
		   select
		     session_id,
		     visitor_id,
		     coalesce(
		       (array_agg(%[1]s order by occurred_at)
		         filter(where nullif(%[1]s::text,'') is not null))[1]::text,
		       ''
		     ) as dimension,
		     coalesce(
		       (array_agg(source order by occurred_at)
		         filter(where kind='page_view'))[1],
		       ''
		     ) as first_source,
		     count(*) filter(where kind='page_view') as pageviews,
		     coalesce(max(duration_ms),0) as duration_ms,
		     bool_or(kind='conversion') as converted
		   from web_events
		   where property_id=$1
		     and occurred_at >= $2
		     and occurred_at <= $3
		   group by session_id, visitor_id
		 )
		 select
		   dimension,
		   dimension,
		   string_agg(distinct first_source, ', '),
		   count(distinct visitor_id)::int,
		   coalesce(
		     count(*) filter(
		       where pageviews > 1 or duration_ms >= 10000
		     )::float8 / nullif(count(*),0),
		     0
		   ),
		   count(*) filter(where converted)::int
		 from session_stats
		 where dimension <> ''
		 group by dimension
		 order by count(distinct visitor_id) desc, dimension
		 limit 12`,
		column,
	)
	rows, err := tx.Query(ctx, query, propertyID, from, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []WebBreakdownRow{}
	for rows.Next() {
		var item WebBreakdownRow
		if err := rows.Scan(
			&item.Key,
			&item.Label,
			&item.Detail,
			&item.Visitors,
			&item.EngagedRate,
			&item.Conversions,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func loadLandingPages(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
) ([]WebPageRow, error) {
	rows, err := tx.Query(
		ctx,
		`with sessions as (
		   select
		     session_id,
		     visitor_id,
		     (array_agg(path order by occurred_at)
		       filter(where kind='page_view'))[1] as landing_path,
		     bool_or(kind='conversion') as converted
		   from web_events
		   where property_id=$1
		     and occurred_at >= $2
		     and occurred_at <= $3
		   group by session_id, visitor_id
		 )
		 select
		   landing_path,
		   count(distinct visitor_id)::int,
		   coalesce(
		     count(*) filter(where converted)::float8 /
		       nullif(count(*),0),
		     0
		   )
		 from sessions
		 where landing_path is not null
		 group by landing_path
		 order by count(distinct visitor_id) desc, landing_path
		 limit 12`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []WebPageRow{}
	for rows.Next() {
		var item WebPageRow
		if err := rows.Scan(
			&item.Path,
			&item.Visitors,
			&item.ConversionRate,
		); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func loadWebVisitors(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
) ([]WebVisitorRow, error) {
	rows, err := tx.Query(
		ctx,
		`select
		   visitor_id::text,
		   coalesce(
		     (array_agg(country_code order by occurred_at desc)
		       filter(where country_code is not null))[1],
		     ''
		   ),
		   (array_agg(browser order by occurred_at desc))[1],
		   (array_agg(operating_system order by occurred_at desc))[1],
		   (array_agg(device order by occurred_at desc))[1],
		   (array_agg(channel order by occurred_at desc))[1],
		   (array_agg(source order by occurred_at desc))[1],
		   max(occurred_at),
		   (array_agg(path order by occurred_at)
		     filter(where kind='page_view'))[1:7],
		   bool_or(kind='conversion')
		 from web_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3
		 group by visitor_id
		 order by max(occurred_at) desc
		 limit 25`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []WebVisitorRow{}
	for rows.Next() {
		var item WebVisitorRow
		if err := rows.Scan(
			&item.ID,
			&item.CountryCode,
			&item.Browser,
			&item.OS,
			&item.Device,
			&item.Channel,
			&item.Source,
			&item.LastSeen,
			&item.Journey,
			&item.Converted,
		); err != nil {
			return nil, err
		}
		item.Alias = anonymousAlias(item.ID)
		if item.Journey == nil {
			item.Journey = []string{}
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func loadCrawlerSnapshot(
	ctx context.Context,
	tx pgx.Tx,
	propertyID string,
	from, now time.Time,
	snapshot *WebCrawlerSnapshot,
) error {
	if err := tx.QueryRow(
		ctx,
		`select
		   count(*)::int,
		   count(*) filter(where detection_method='verified_ip')::int
		 from web_crawler_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3`,
		propertyID,
		from,
		now,
	).Scan(&snapshot.Requests, &snapshot.Verified); err != nil {
		return err
	}
	seriesRows, err := tx.Query(
		ctx,
		`select occurred_at::date::text, category::text, count(*)::int
		 from web_crawler_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3
		 group by occurred_at::date, category
		 order by occurred_at::date, category`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return err
	}
	for seriesRows.Next() {
		var item WebCrawlerSeries
		if err := seriesRows.Scan(
			&item.Date,
			&item.Category,
			&item.Requests,
		); err != nil {
			seriesRows.Close()
			return err
		}
		snapshot.Series = append(snapshot.Series, item)
	}
	if err := seriesRows.Err(); err != nil {
		seriesRows.Close()
		return err
	}
	seriesRows.Close()

	providerRows, err := tx.Query(
		ctx,
		`select
		   provider,
		   count(*)::int,
		   coalesce(
		     count(*)::float8 / nullif(
		       sum(count(*)) over(),
		       0
		     ),
		     0
		   )
		 from web_crawler_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3
		 group by provider
		 order by count(*) desc, provider
		 limit 10`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return err
	}
	for providerRows.Next() {
		var item WebCrawlerProvider
		if err := providerRows.Scan(
			&item.Provider,
			&item.Requests,
			&item.Share,
		); err != nil {
			providerRows.Close()
			return err
		}
		snapshot.Providers = append(snapshot.Providers, item)
	}
	if err := providerRows.Err(); err != nil {
		providerRows.Close()
		return err
	}
	providerRows.Close()

	pageRows, err := tx.Query(
		ctx,
		`select path, count(*)::int
		 from web_crawler_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3
		 group by path
		 order by count(*) desc, path
		 limit 10`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return err
	}
	for pageRows.Next() {
		var item WebCrawlerPage
		if err := pageRows.Scan(&item.Path, &item.Requests); err != nil {
			pageRows.Close()
			return err
		}
		snapshot.Pages = append(snapshot.Pages, item)
	}
	if err := pageRows.Err(); err != nil {
		pageRows.Close()
		return err
	}
	pageRows.Close()

	categoryRows, err := tx.Query(
		ctx,
		`select category::text, count(*)::int
		 from web_crawler_events
		 where property_id=$1
		   and occurred_at >= $2
		   and occurred_at <= $3
		 group by category
		 order by count(*) desc, category`,
		propertyID,
		from,
		now,
	)
	if err != nil {
		return err
	}
	for categoryRows.Next() {
		var item WebCrawlerCategory
		if err := categoryRows.Scan(&item.Category, &item.Requests); err != nil {
			categoryRows.Close()
			return err
		}
		snapshot.Categories = append(snapshot.Categories, item)
	}
	if err := categoryRows.Err(); err != nil {
		categoryRows.Close()
		return err
	}
	categoryRows.Close()
	return nil
}

func anonymousAlias(id string) string {
	adjectives := []string{
		"Amber",
		"Coral",
		"Indigo",
		"Juniper",
		"Silver",
		"Sage",
		"Velvet",
		"Willow",
	}
	animals := []string{
		"Falcon",
		"Fox",
		"Lynx",
		"Otter",
		"Owl",
		"Raven",
		"Stag",
		"Wren",
	}
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(id))
	value := hash.Sum32()
	return adjectives[int(value)%len(adjectives)] + " " +
		animals[int(value/uint32(len(adjectives)))%len(animals)]
}
