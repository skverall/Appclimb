package syncer

import "time"

const DefaultSyncInterval = 6 * time.Hour

func NextSync(lastSync time.Time, now time.Time, interval time.Duration) time.Time {
	if interval <= 0 {
		interval = DefaultSyncInterval
	}
	if lastSync.IsZero() {
		return now.UTC()
	}

	next := lastSync.UTC().Add(interval)
	if next.Before(now.UTC()) {
		return now.UTC()
	}
	return next
}

func UTCWindow(now time.Time, historyDays int) (time.Time, time.Time) {
	if historyDays <= 0 || historyDays > 90 {
		historyDays = 90
	}
	end := time.Date(
		now.UTC().Year(),
		now.UTC().Month(),
		now.UTC().Day(),
		0,
		0,
		0,
		0,
		time.UTC,
	).Add(24 * time.Hour)
	return end.AddDate(0, 0, -historyDays), end
}
