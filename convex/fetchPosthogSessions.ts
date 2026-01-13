import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const POSTHOG_API_URL = "https://us.posthog.com/api";
const POSTHOG_PROJECT_ID = 198125;

interface PostHogRecording {
  id: string;
  session_id: string;
  distinct_id: string;
  recording_duration: number;
  start_time: string;
  end_time: string;
  click_count: number;
  keypress_count: number;
  console_error_count: number;
  start_url: string;
  person?: {
    id: number;
    name?: string;
    distinct_ids: string[];
  };
}

// New fetch action with completely different name
export const sync = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY not configured");
    }

    const url = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/?limit=${limit}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`PostHog API error: ${response.status}`);
    }

    const data = await response.json();
    const results = [];

    for (const rec of data.results as PostHogRecording[]) {
      try {
        const pageUrl = new URL(rec.start_url);
        await ctx.runMutation(api.sessions.create, {
          posthogId: rec.id,
          userId: rec.person?.name || rec.distinct_id,
          startTime: new Date(rec.start_time).getTime(),
          endTime: new Date(rec.end_time).getTime(),
          duration: rec.recording_duration,
          device: {
            type: "desktop" as const,
            browser: "Unknown",
            os: "Unknown",
            screenResolution: "Unknown",
          },
          location: { country: "Unknown" },
          events: [],
          status: "watching" as const,
          pageViews: [pageUrl.pathname],
          errorCount: rec.console_error_count,
          rageClicks: 0,
          deadClicks: 0,
          tags: [],
        });
        results.push({ id: rec.id, status: "stored" });
      } catch (e) {
        results.push({ id: rec.id, status: "error", error: String(e) });
      }
    }

    return { count: data.results.length, results };
  },
});
