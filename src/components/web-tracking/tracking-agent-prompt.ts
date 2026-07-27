/**
 * The single source of the AppClimb AI-coding-agent install prompt (Task P0.23).
 *
 * Task P0.25 requires the first prompt to stay focused on the browser install.
 * Optional crawler forwarding is a separate prompt behind the advanced tab and
 * is never appended to the default one.
 */

import {
  buildConversionSnippet,
  buildCrawlerForwardingSnippet,
  buildTrackingSnippet,
  type TrackingInstallTarget,
} from "./tracking-snippet";

export interface TrackingAgentPromptOptions extends TrackingInstallTarget {
  /** Human name of the property, when it differs from the domain. */
  name?: string;
  /** Configured primary conversion goal, if the user already picked one. */
  conversionGoal?: string | null;
}

/** One function generates the AI-agent prompt. Do not fork this string. */
export function buildTrackingAgentPrompt(
  options: TrackingAgentPromptOptions,
): string {
  const { domain, name, conversionGoal } = options;
  const snippet = buildTrackingSnippet(options);
  const title = name && name !== domain ? `${name} (${domain})` : domain;
  const goal = (conversionGoal ?? "").trim();

  const lines = [
    `# Add AppClimb first-party web analytics to ${domain}`,
    ``,
    `Integrate AppClimb first-party web analytics into the website repository for ${title}.`,
    ``,
    `## Goal`,
    `- Record anonymous page views, referrers, UTM campaigns and landing pages`,
    `- Session-scoped visitor IDs, no IP addresses stored`,
    `- No third-party analytics vendor is involved`,
    ``,
    `## 1. Add the browser tracking script`,
    `Render this tag on every page, just before the closing </body> tag of the`,
    `root layout (Next.js \`app/layout.tsx\`) or the HTML entry point.`,
    ``,
    "```html",
    snippet,
    "```",
    ``,
  ];

  if (goal) {
    lines.push(
      `## 2. Fire the configured conversion goal`,
      `AppClimb's primary conversion goal for this site is \`${goal}\`.`,
      `Call this exactly when that goal really happens — not on page load.`,
      ``,
      "```javascript",
      buildConversionSnippet(goal),
      "```",
      ``,
    );
  } else {
    lines.push(
      `## 2. Conversion events (after the first page view is verified)`,
      `Once AppClimb confirms the first real page view, a conversion goal is`,
      `configured in the product. Call it exactly when the goal happens:`,
      ``,
      "```javascript",
      buildConversionSnippet("account_created"),
      "```",
      ``,
    );
  }

  lines.push(
    `## Constraints`,
    // Never name another analytics product here. The prompt is handed to the
    // customer's own coding agent, and naming a vendor both reads as an
    // endorsement and invites the agent to go install it instead.
    `- Use this snippet as written; do not substitute another analytics vendor`,
    `- Do not change or regenerate the token value`,
    `- Serve the script only on ${domain}`,
    `- Do not fire synthetic or test events to make the dashboard look populated`,
    ``,
    `## Done means`,
    `Deploy to the live site, open https://${domain} once in a normal browser,`,
    `then return to AppClimb. AppClimb only reports the website as installed`,
    `after it accepts a real browser event.`,
  );

  return lines.join("\n");
}

/**
 * Separate, opt-in prompt for server-side crawler forwarding. Kept out of the
 * default install so the first hand-off is not overloaded (Task P0.25).
 */
export function buildCrawlerAgentPrompt(
  options: TrackingAgentPromptOptions,
): string {
  return [
    `# Optional: forward AI and search crawler requests for ${options.domain}`,
    ``,
    `Only do this after the browser tracking script is verified in AppClimb.`,
    `This adds server-side visibility for AI answer engines, search indexers and`,
    `model-training crawlers. It does not change human visitor metrics.`,
    ``,
    "```bash",
    buildCrawlerForwardingSnippet(options),
    "```",
    ``,
    `## Constraints`,
    `- Keep the token server-side; never expose it in a client bundle`,
    `- Forward the original User-Agent header unchanged`,
    `- Do not classify crawlers yourself — AppClimb does that server-side`,
  ].join("\n");
}
