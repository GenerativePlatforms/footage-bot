import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

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
    dateFrom: v.optional(v.string()), // ISO date string e.g. "2026-01-12"
    personId: v.optional(v.string()), // Filter by person/user email
  },
  handler: async (ctx, { limit = 20, dateFrom, personId }) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY not configured");
    }

    // Build query params
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (dateFrom) {
      params.set("date_from", dateFrom);
    }
    if (personId) {
      params.set("person_uuid", personId);
    }

    // Fetch session recordings
    const recordingsUrl = `${POSTHOG_API_URL}/projects/${POSTHOG_PROJECT_ID}/session_recordings/?${params.toString()}`;
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
        // Get all blob keys and sort them
        const blobKeys = blobV2Sources.map((s: any) => parseInt(s.blob_key, 10)).sort((a: number, b: number) => a - b);

        // PostHog limits to 20 blob keys per request, so we need to chunk
        const CHUNK_SIZE = 20;
        for (let i = 0; i < blobKeys.length; i += CHUNK_SIZE) {
          const chunkKeys = blobKeys.slice(i, i + CHUNK_SIZE);
          const minKey = chunkKeys[0];
          const maxKey = chunkKeys[chunkKeys.length - 1];

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
                      // Include all events with valid type and timestamp
                      // rrweb event types: 0-6 (DomContentLoaded, Load, FullSnapshot, IncrementalSnapshot, Meta, Custom, Plugin)
                      // Note: data can be compressed string - rrweb-player handles decompression
                      const isValidEvent = typeof event === 'object' &&
                          typeof event.type === 'number' &&
                          typeof event.timestamp === 'number';

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
            console.error('Failed to fetch blob_v2 chunk:', e);
          }
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

// Query to get recent sessions sorted by startTime
export const listRecentSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_startTime")
      .order("desc")
      .take(limit);
  },
});

// Extract meaningful events from rrweb snapshots for AI analysis
function extractEventsForAnalysis(snapshots: any[]): string {
  const events: string[] = [];
  let lastUrl = "";

  for (const event of snapshots) {
    if (!event || typeof event !== "object") continue;

    // Type 4 = Meta event (contains URL)
    if (event.type === 4 && event.data?.href) {
      const url = event.data.href;
      if (url !== lastUrl) {
        events.push(`[Navigation] Visited: ${url}`);
        lastUrl = url;
      }
    }

    // Type 3 = IncrementalSnapshot (contains user interactions)
    if (event.type === 3 && event.data) {
      const source = event.data.source;

      // source 1 = MouseMove, 2 = MouseInteraction, 5 = Input
      if (source === 2 && event.data.type !== undefined) {
        // Mouse interactions: 0=mouseup, 1=mousedown, 2=click, 3=contextmenu, 4=dblclick
        const interactionTypes: Record<number, string> = {
          2: "Click",
          4: "Double-click",
          3: "Right-click",
        };
        const interactionType = interactionTypes[event.data.type];
        if (interactionType) {
          events.push(`[${interactionType}] at position (${event.data.x}, ${event.data.y})`);
        }
      }

      if (source === 5 && event.data.text !== undefined) {
        // Input events - don't log actual text for privacy, just note input happened
        events.push(`[Input] User typed in a form field`);
      }
    }

    // Type 6 = Plugin event (may contain console logs)
    if (event.type === 6 && event.data?.plugin === "rrweb/console@1") {
      const payload = event.data.payload;
      if (payload?.level && payload?.payload) {
        const level = payload.level.toUpperCase();
        if (level === "ERROR" || level === "WARN") {
          events.push(`[Console ${level}] ${String(payload.payload).slice(0, 200)}`);
        }
      }
    }
  }

  // Limit to 500 events to avoid token limits
  return events.slice(0, 500).join("\n");
}

// Analyze a single session with AI
export const analyzeSession = action({
  args: {
    posthogId: v.string(),
  },
  handler: async (ctx, { posthogId }) => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Get session from database
    const session = await ctx.runQuery(api.sessions.getByPosthogId, { posthogId });
    if (!session) {
      throw new Error(`Session not found: ${posthogId}`);
    }

    // Skip if already analyzed
    if (session.summary && session.status === "summarized") {
      return { status: "already_analyzed", posthogId };
    }

    // Fetch snapshots
    const snapshots = await ctx.runAction(api.posthogSync.fetchSnapshots, { posthogId });
    if (!snapshots || snapshots.length === 0) {
      return { status: "no_snapshots", posthogId };
    }

    // Extract events for analysis
    const eventLog = extractEventsForAnalysis(snapshots);

    // Build context about the session
    const sessionContext = `
Session Details:
- User: ${session.userId || "Anonymous"}
- Duration: ${Math.round(session.duration / 60)} minutes
- Start Time: ${new Date(session.startTime).toISOString()}
- Pages Viewed: ${session.pageViews?.join(", ") || "Unknown"}
- Error Count: ${session.errorCount || 0}
- Device: ${session.device?.type || "Unknown"} / ${session.device?.browser || "Unknown"} / ${session.device?.os || "Unknown"}

User Activity Log:
${eventLog || "No detailed activity captured"}
`;

    // Call Claude API for analysis
    const client = new Anthropic({ apiKey: anthropicKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are analyzing a user session recording from a video generation app (footage.com). Based on the session data below, provide a structured analysis.

${sessionContext}

Provide your analysis in the following JSON format:
{
  "overview": "Brief 1-2 sentence summary of what the user did",
  "userIntent": "What the user was trying to accomplish",
  "painPoints": ["List of friction points or issues encountered"],
  "successfulFlows": ["List of successful actions completed"],
  "recommendations": ["UX/product improvement suggestions"],
  "sentiment": "positive|neutral|negative|frustrated",
  "engagementScore": 1-10,
  "noteTitle": "Short title for this session analysis",
  "noteType": "finding|recommendation|bug|ux_issue|feature_request|pattern",
  "notePriority": "low|medium|high|critical"
}

Return ONLY valid JSON, no other text.`
        }
      ]
    });

    // Parse the response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    let analysis;
    try {
      analysis = JSON.parse(content.text);
    } catch (e) {
      // Try to extract JSON from the response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse analysis: ${content.text.slice(0, 200)}`);
      }
    }

    // Update the session with summary
    await ctx.runMutation(api.sessions.update, {
      id: session._id,
      summary: {
        overview: analysis.overview || "No overview available",
        userIntent: analysis.userIntent || "Unknown",
        painPoints: analysis.painPoints || [],
        successfulFlows: analysis.successfulFlows || [],
        recommendations: analysis.recommendations || [],
        sentiment: analysis.sentiment || "neutral",
        engagementScore: analysis.engagementScore || 5,
      },
      status: "summarized",
    });

    // Create a note for this session
    await ctx.runMutation(api.notes.create, {
      sessionId: posthogId,
      type: analysis.noteType || "finding",
      priority: analysis.notePriority || "medium",
      title: analysis.noteTitle || `Session Analysis: ${session.userId || "Anonymous"}`,
      description: `${analysis.overview}\n\nUser Intent: ${analysis.userIntent}\n\nPain Points:\n${(analysis.painPoints || []).map((p: string) => `- ${p}`).join("\n")}\n\nRecommendations:\n${(analysis.recommendations || []).map((r: string) => `- ${r}`).join("\n")}`,
      affectedSessions: 1,
      status: "new",
      tags: [session.userId || "anonymous", analysis.sentiment || "neutral"],
    });

    return {
      status: "analyzed",
      posthogId,
      overview: analysis.overview,
      sentiment: analysis.sentiment,
      engagementScore: analysis.engagementScore,
    };
  },
});

// Analyze the most recent sessions
export const analyzeRecentSessions = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 10 }): Promise<{
    total: number;
    results: Array<{ status: string; posthogId: string; overview?: string; sentiment?: string; engagementScore?: number; error?: string }>;
  }> => {
    // Get recent sessions using direct query instead of api reference to avoid circular type
    const sessions = await ctx.runQuery(api.posthogSync.listRecentSessions, { limit });

    const results: Array<{ status: string; posthogId: string; overview?: string; sentiment?: string; engagementScore?: number; error?: string }> = [];
    for (const session of sessions) {
      try {
        // Call analyzeSession directly to avoid circular reference
        const result = await ctx.runAction(api.posthogSync.analyzeSession, {
          posthogId: session.posthogId
        }) as { status: string; posthogId: string; overview?: string; sentiment?: string; engagementScore?: number };
        results.push(result);
        console.log(`Analyzed session ${session.posthogId}:`, result.status);
      } catch (e) {
        console.error(`Failed to analyze session ${session.posthogId}:`, e);
        results.push({
          status: "error",
          posthogId: session.posthogId,
          error: String(e)
        });
      }
    }

    return {
      total: sessions.length,
      results,
    };
  },
});
