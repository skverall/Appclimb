package webanalytics

import "testing"

func TestClassifyAcquisitionRecognizesHumanReferralSources(t *testing.T) {
	tests := []struct {
		name     string
		referrer string
		source   string
		medium   string
		channel  string
		label    string
	}{
		{"direct", "", "", "", "Direct", "Direct / none"},
		{"google", "https://www.google.com/search?q=appclimb", "", "", "Organic Search", "Google"},
		{"x", "https://t.co/abc", "", "", "Social", "X"},
		{"instagram", "https://l.instagram.com/", "", "", "Social", "Instagram"},
		{"chatgpt", "https://chatgpt.com/c/answer", "", "", "AI Referral", "ChatGPT"},
		{"perplexity", "https://www.perplexity.ai/search/answer", "", "", "AI Referral", "Perplexity"},
		{"paid campaign", "", "google", "cpc", "Campaigns", "Google"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := ClassifyAcquisition(
				test.referrer,
				test.source,
				test.medium,
			)
			if got.Channel != test.channel || got.Source != test.label {
				t.Fatalf(
					"got channel=%q source=%q, want channel=%q source=%q",
					got.Channel,
					got.Source,
					test.channel,
					test.label,
				)
			}
		})
	}
}

func TestClassifyCrawlerSeparatesAnswerIndexAndTrainingAgents(t *testing.T) {
	tests := []struct {
		ua       string
		provider string
		category string
	}{
		{"Mozilla/5.0; ChatGPT-User/1.0", "ChatGPT", "ai_answer"},
		{"OAI-SearchBot/1.0", "OpenAI", "search_index"},
		{"Mozilla/5.0 compatible; GPTBot/1.2", "OpenAI", "model_training"},
		{"ClaudeBot/1.0", "Anthropic", "model_training"},
	}
	for _, test := range tests {
		got, ok := ClassifyCrawler(test.ua)
		if !ok ||
			got.Provider != test.provider ||
			got.Category != test.category {
			t.Fatalf("classify %q: got %+v ok=%v", test.ua, got, ok)
		}
	}
	if _, ok := ClassifyCrawler("Mozilla/5.0 Chrome/140"); ok {
		t.Fatal("a normal browser must not be classified as a crawler")
	}
}

func TestTokenIssuerRejectsTampering(t *testing.T) {
	issuer := TokenIssuer{Key: []byte("0123456789abcdef0123456789abcdef")}
	token, err := issuer.Issue(TokenClaims{
		WorkspaceID: "workspace-1",
		PropertyID:  "property-1",
		Version:     1,
	})
	if err != nil {
		t.Fatal(err)
	}
	claims, err := issuer.Parse(token)
	if err != nil ||
		claims.WorkspaceID != "workspace-1" ||
		claims.PropertyID != "property-1" {
		t.Fatalf("unexpected token round trip: claims=%+v err=%v", claims, err)
	}
	replacement := "A"
	if token[len(token)-1:] == replacement {
		replacement = "B"
	}
	tampered := token[:len(token)-1] + replacement
	if _, err := issuer.Parse(tampered); err == nil {
		t.Fatal("tampered token must be rejected")
	}
}

func TestParseClientDevice(t *testing.T) {
	got := ParseClientDevice(
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) " +
			"AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
	)
	if got.Browser != "Safari" || got.OS != "iOS" || got.Device != "Mobile" {
		t.Fatalf("unexpected iPhone classification: %+v", got)
	}
}
