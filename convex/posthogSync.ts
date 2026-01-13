import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

// PostHog API configuration - v2
const POSTHOG_API_URL = "https://us.posthog.com/api";
const POSTHOG_PROJECT_ID = 198125; // footage.com project

interface PostHogRecording {
  id: string;
  session_id: string;
  distinct_id: string;
  viewed: boolean;
  recording_duration: number;
  active_seconds: number;
  inactive_seconds: number;
  start_time: string;
  end_time: string;
  click_count: number;
  keypress_count: number;
  mouse_activity_count: number;
  console_log_count: number;
  console_warn_count: number;
  console_error_count: number;
  start_url: string;
  person?: {
    id: number;
    name?: string;
    distinct_ids: string[];
    properties: Record<string, unknown>;
  };
}

interface PostHogRecordingsResponse {
  results: PostHogRecording[];
  next?: string;
}

// Fetch session recordings list from PostHog
export const fetchRecordings = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY not configured");
    }

    // Fetch session recordings
    const recordingsUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/?limit=${limit}`;
    console.log("Fetching from:", recordingsUrl);

    const recordingsResponse = await fetch(recordingsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!recordingsResponse.ok) {
      const error = await recordingsResponse.text();
      throw new Error(`Failed to fetch recordings: ${recordingsResponse.status} ${error}`);
    }

    const data: PostHogRecordingsResponse = await recordingsResponse.json();

    // Store each recording using sessions.create (which works)
    const results = [];
    for (const recording of data.results) {
      try {
        const pageUrl = new URL(recording.start_url);
        await ctx.runMutation(api.sessions.create, {
          posthogId: recording.id,
          userId: recording.person?.name || recording.distinct_id,
          startTime: new Date(recording.start_time).getTime(),
          endTime: new Date(recording.end_time).getTime(),
          duration: recording.recording_duration,
          device: {
            type: "desktop" as const,
            browser: "Unknown",
            os: "Unknown",
            screenResolution: "Unknown",
          },
          location: {
            country: "Unknown",
          },
          events: [],
          status: "watching" as const,
          pageViews: [pageUrl.pathname],
          errorCount: recording.console_error_count,
          rageClicks: 0,
          deadClicks: 0,
          tags: [],
        });
        results.push({ id: recording.id, status: "stored" });
      } catch (e) {
        results.push({ id: recording.id, status: "error", error: String(e) });
      }
    }

    return {
      projectId: POSTHOG_PROJECT_ID,
      recordingsCount: data.results.length,
      results,
      hasMore: !!data.next,
    };
  },
});

// Internal mutation to store a recording
export const storeRecording = internalMutation({
  args: {
    posthogId: v.string(),
    sessionId: v.string(),
    distinctId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    duration: v.number(),
    startUrl: v.string(),
    clickCount: v.number(),
    keypressCount: v.number(),
    consoleErrorCount: v.number(),
    personId: v.optional(v.number()),
    personName: v.optional(v.string()),
    personDistinctIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_posthogId", (q) => q.eq("posthogId", args.posthogId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Parse URL for page views
    const pageUrl = new URL(args.startUrl);

    // Detect device type from URL or default to desktop
    const deviceType = "desktop" as const;

    return await ctx.db.insert("sessions", {
      posthogId: args.posthogId,
      userId: args.personName || args.distinctId,
      startTime: args.startTime,
      endTime: args.endTime,
      duration: args.duration,
      device: {
        type: deviceType,
        browser: "Unknown",
        os: "Unknown",
        screenResolution: "Unknown",
      },
      location: {
        country: "Unknown",
      },
      events: [], // Events will be fetched separately if needed
      status: "watching",
      pageViews: [pageUrl.pathname],
      errorCount: args.consoleErrorCount,
      rageClicks: 0,
      deadClicks: 0,
      tags: [],
    });
  },
});

// Fetch snapshots (rrweb events) for a specific recording
export const fetchSnapshots = action({
  args: {
    posthogId: v.string(),
  },
  handler: async (ctx, { posthogId }) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY not configured");
    }

    // Fetch snapshots for this recording
    const snapshotsUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/${posthogId}/snapshots`;
    const response = await fetch(snapshotsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch snapshots: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data;
  },
});
