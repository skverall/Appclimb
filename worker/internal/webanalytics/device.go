package webanalytics

import "strings"

type ClientDevice struct {
	Browser string
	OS      string
	Device  string
}

func ParseClientDevice(userAgent string) ClientDevice {
	normalized := strings.ToLower(userAgent)
	device := "Desktop"
	switch {
	case strings.Contains(normalized, "ipad") ||
		strings.Contains(normalized, "tablet"):
		device = "Tablet"
	case strings.Contains(normalized, "iphone") ||
		strings.Contains(normalized, "android") &&
			strings.Contains(normalized, "mobile"):
		device = "Mobile"
	}

	os := "Other"
	switch {
	case strings.Contains(normalized, "iphone") ||
		strings.Contains(normalized, "ipad"):
		os = "iOS"
	case strings.Contains(normalized, "android"):
		os = "Android"
	case strings.Contains(normalized, "windows"):
		os = "Windows"
	case strings.Contains(normalized, "mac os x") ||
		strings.Contains(normalized, "macintosh"):
		os = "macOS"
	case strings.Contains(normalized, "cros"):
		os = "ChromeOS"
	case strings.Contains(normalized, "linux"):
		os = "Linux"
	}

	browser := "Other"
	switch {
	case strings.Contains(normalized, "edg/"):
		browser = "Edge"
	case strings.Contains(normalized, "opr/") ||
		strings.Contains(normalized, "opera"):
		browser = "Opera"
	case strings.Contains(normalized, "firefox/"):
		browser = "Firefox"
	case strings.Contains(normalized, "chrome/") ||
		strings.Contains(normalized, "crios/"):
		browser = "Chrome"
	case strings.Contains(normalized, "safari/"):
		browser = "Safari"
	}
	return ClientDevice{Browser: browser, OS: os, Device: device}
}
