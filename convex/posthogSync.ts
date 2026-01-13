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

    // Fetch snapshots for this recording - PostHog requires Content-Length header
    const snapshotsUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/${posthogId}/snapshots`;
    const response = await fetch(snapshotsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Length": "0",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch snapshots: ${response.status} ${error}`);
    }

    const data = await response.json();

    // PostHog returns snapshots in different formats depending on the version
    // Handle the sources/blob format
    if (data.sources && data.sources.length > 0) {
      const allEvents: any[] = [];

      // For blob_v2, we need to fetch with start and end blob keys
      const blobV2Sources = data.sources.filter((s: any) => s.source === 'blob_v2');
      const blobSources = data.sources.filter((s: any) => s.source === 'blob');

      if (blobV2Sources.length > 0) {
        // Get min and max blob keys for range request
        const blobKeys = blobV2Sources.map((s: any) => parseInt(s.blob_key, 10));
        const minKey = Math.min(...blobKeys);
        const maxKey = Math.max(...blobKeys);

        const blobUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/${posthogId}/snapshots?source=blob_v2&start_blob_key=${minKey}&end_blob_key=${maxKey}`;

        try {
          const blobResponse = await fetch(blobUrl, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Length": "0",
            },
          });

          if (blobResponse.ok) {
            const text = await blobResponse.text();

            // Parse NDJSON format (newline-delimited JSON)
            const lines = text.trim().split('\n');

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const parsed = JSON.parse(line);

                  // PostHog blob_v2 format: [window_id, event_object]
                  if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string') {
                    const event = parsed[1];
                    // Only include valid rrweb events:
                    // - type must be a number (0-6 for rrweb event types)
                    // - data must be an object (not a compressed string)
                    // PostHog sometimes sends compressed events where data is binary string
                    const isValidEvent = typeof event === 'object' &&
                        typeof event.type === 'number' &&
                        event.type >= 0 && event.type <= 6 &&
                        typeof event.timestamp === 'number' &&
                        (event.data === undefined || typeof event.data === 'object');

                    if (isValidEvent) {
                      allEvents.push(event);
                    }
                  }
                  // Alternative format: {window_id, data: [...events]}
                  else if (parsed.window_id && parsed.data && Array.isArray(parsed.data)) {
                    for (const event of parsed.data) {
                      if (typeof event === 'object' && event.type !== undefined) {
                        allEvents.push(event);
                      }
                    }
                  }
                  // Single rrweb event
                  else if (typeof parsed === 'object' && parsed.type !== undefined) {
                    allEvents.push(parsed);
                  }
                } catch (parseErr) {
                  // Not valid JSON line, skip
                }
              }
            }
          } else {
            console.error("Blob_v2 fetch failed:", blobResponse.status, await blobResponse.text());
          }
        } catch (e) {
          console.error('Failed to fetch blob_v2:', e);
        }
      }

      // Handle legacy blob format
      for (const source of blobSources) {
        if (source.blob_key !== undefined) {
          try {
            const blobUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/${posthogId}/snapshots?source=blob&blob_key=${source.blob_key}`;
            const blobResponse = await fetch(blobUrl, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Length": "0",
              },
            });

            if (blobResponse.ok) {
              const blobData = await blobResponse.json();
              if (Array.isArray(blobData)) {
                allEvents.push(...blobData);
              } else if (blobData.snapshot_data_by_window_id) {
                for (const windowId in blobData.snapshot_data_by_window_id) {
                  const windowEvents = blobData.snapshot_data_by_window_id[windowId];
                  if (Array.isArray(windowEvents)) {
                    allEvents.push(...windowEvents);
                  }
                }
              }
            }
          } catch (e) {
            console.error('Failed to fetch blob:', source.blob_key, e);
          }
        }
      }

      // Sort events by timestamp
      allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return allEvents;
    }

    // Handle snapshot_data_by_window_id format
    if (data.snapshot_data_by_window_id) {
      const allEvents: any[] = [];
      for (const windowId in data.snapshot_data_by_window_id) {
        const windowEvents = data.snapshot_data_by_window_id[windowId];
        if (Array.isArray(windowEvents)) {
          allEvents.push(...windowEvents);
        }
      }
      allEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return allEvents;
    }

    // Return as-is if already an array
    if (Array.isArray(data)) {
      return data;
    }

    return [];
  },
});
