package webanalytics

import (
	"net"
	"net/url"
	"regexp"
	"strings"
)

type AcquisitionSource struct {
	Channel      string
	Source       string
	ReferrerHost string
}

type Crawler struct {
	Provider string
	Agent    string
	Category string
}

type crawlerRule struct {
	needle   string
	provider string
	agent    string
	category string
}

var crawlerRules = []crawlerRule{
	{"chatgpt-user", "ChatGPT", "ChatGPT-User", "ai_answer"},
	{"claude-user", "Anthropic", "Claude-User", "ai_answer"},
	{"perplexity-user", "Perplexity", "Perplexity-User", "ai_answer"},
	{"oai-searchbot", "OpenAI", "OAI-SearchBot", "search_index"},
	{"perplexitybot", "Perplexity", "PerplexityBot", "search_index"},
	{"google-extended", "Google", "Google-Extended", "model_training"},
	{"googlebot", "Google", "Googlebot", "search_index"},
	{"bingbot", "Microsoft", "Bingbot", "search_index"},
	{"applebot-extended", "Apple", "Applebot-Extended", "model_training"},
	{"applebot", "Apple", "Applebot", "search_index"},
	{"gptbot", "OpenAI", "GPTBot", "model_training"},
	{"claudebot", "Anthropic", "ClaudeBot", "model_training"},
	{"anthropic-ai", "Anthropic", "anthropic-ai", "model_training"},
	{"cohere-ai", "Cohere", "cohere-ai", "model_training"},
	{"bytespider", "ByteDance", "Bytespider", "model_training"},
	{"ccbot", "Common Crawl", "CCBot", "model_training"},
}

var campaignMedium = regexp.MustCompile(
	`(?i)^(cpc|ppc|paid|paid_social|display|affiliate|email|newsletter|sms)$`,
)

func ClassifyAcquisition(
	referrer, utmSource, utmMedium string,
) AcquisitionSource {
	host := referrerHostname(referrer)
	normalizedUTM := strings.TrimSpace(utmSource)
	if normalizedUTM != "" {
		channel := channelForHost(normalizedUTM)
		if campaignMedium.MatchString(strings.TrimSpace(utmMedium)) {
			channel = "Campaigns"
		}
		if channel == "Direct" || channel == "Referral" {
			channel = "Campaigns"
		}
		return AcquisitionSource{
			Channel:      channel,
			Source:       sourceLabel(normalizedUTM),
			ReferrerHost: host,
		}
	}
	if host == "" {
		return AcquisitionSource{
			Channel: "Direct",
			Source:  "Direct / none",
		}
	}
	return AcquisitionSource{
		Channel:      channelForHost(host),
		Source:       sourceLabel(host),
		ReferrerHost: host,
	}
}

func ClassifyCrawler(userAgent string) (Crawler, bool) {
	normalized := strings.ToLower(userAgent)
	for _, rule := range crawlerRules {
		if strings.Contains(normalized, rule.needle) {
			return Crawler{
				Provider: rule.provider,
				Agent:    rule.agent,
				Category: rule.category,
			}, true
		}
	}
	return Crawler{}, false
}

func NormalizeHostname(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if parsed, err := url.Parse("https://" + value); err == nil {
		value = parsed.Hostname()
	}
	value = strings.TrimSuffix(value, ".")
	value = strings.TrimPrefix(value, "www.")
	return value
}

func HostMatchesProperty(host, propertyDomain string) bool {
	host = NormalizeHostname(host)
	propertyDomain = NormalizeHostname(propertyDomain)
	return host != "" &&
		propertyDomain != "" &&
		(host == propertyDomain ||
			strings.HasSuffix(host, "."+propertyDomain))
}

func referrerHostname(referrer string) string {
	referrer = strings.TrimSpace(referrer)
	if referrer == "" {
		return ""
	}
	parsed, err := url.Parse(referrer)
	if err != nil {
		return ""
	}
	return NormalizeHostname(parsed.Hostname())
}

func channelForHost(value string) string {
	host := NormalizeHostname(value)
	switch {
	case host == "":
		return "Direct"
	case matchesHost(host,
		"chatgpt.com",
		"chat.openai.com",
		"perplexity.ai",
		"claude.ai",
		"gemini.google.com",
		"copilot.microsoft.com",
		"you.com",
	):
		return "AI Referral"
	case matchesHost(host,
		"x.com",
		"t.co",
		"twitter.com",
		"instagram.com",
		"facebook.com",
		"linkedin.com",
		"reddit.com",
		"threads.net",
		"tiktok.com",
		"youtube.com",
	):
		return "Social"
	case isSearchHost(host):
		return "Organic Search"
	default:
		return "Referral"
	}
}

func sourceLabel(value string) string {
	host := NormalizeHostname(value)
	switch {
	case matchesHost(host, "x.com", "t.co", "twitter.com"):
		return "X"
	case matchesHost(host, "instagram.com"):
		return "Instagram"
	case matchesHost(host, "facebook.com"):
		return "Facebook"
	case matchesHost(host, "linkedin.com"):
		return "LinkedIn"
	case matchesHost(host, "reddit.com"):
		return "Reddit"
	case matchesHost(host, "chatgpt.com", "chat.openai.com"):
		return "ChatGPT"
	case matchesHost(host, "perplexity.ai"):
		return "Perplexity"
	case matchesHost(host, "claude.ai"):
		return "Claude"
	case matchesHost(host, "gemini.google.com"):
		return "Gemini"
	case matchesHost(host, "copilot.microsoft.com"):
		return "Microsoft Copilot"
	case host == "google" || strings.Contains(host, "google."):
		return "Google"
	case matchesHost(host, "bing.com"):
		return "Bing"
	case matchesHost(host, "search.brave.com"):
		return "Brave Search"
	case matchesHost(host, "duckduckgo.com"):
		return "DuckDuckGo"
	}
	if host == "" {
		return strings.TrimSpace(value)
	}
	return host
}

func matchesHost(host string, domains ...string) bool {
	for _, domain := range domains {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func isSearchHost(host string) bool {
	if matchesHost(host,
		"bing.com",
		"duckduckgo.com",
		"search.brave.com",
		"yahoo.com",
		"yandex.com",
		"yandex.ru",
		"baidu.com",
	) {
		return true
	}
	if strings.HasPrefix(host, "google.") ||
		strings.Contains(host, ".google.") {
		return true
	}
	return net.ParseIP(host) == nil && strings.HasPrefix(host, "search.")
}
