import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Get a recording by session ID
export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();
  },
});

// List recent recordings
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_startTime")
      .order("desc")
      .take(limit);
  },
});

// List all recordings (no index)
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    return await ctx.db
      .query("recordings")
      .take(limit);
  },
});

// List recordings by IP
export const listByIp = query({
  args: { ipAddress: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { ipAddress, limit = 20 }) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_ipAddress", (q) => q.eq("ipAddress", ipAddress))
      .order("desc")
      .take(limit);
  },
});

// Create a new recording session
export const create = mutation({
  args: {
    sessionId: v.string(),
    ipAddress: v.optional(v.string()),
    events: v.array(v.any()),
    startTime: v.number(),
    pageUrl: v.string(),
    userAgent: v.string(),
    metadata: v.optional(v.object({
      screenWidth: v.number(),
      screenHeight: v.number(),
      deviceType: v.optional(v.string()),
      browser: v.optional(v.string()),
      os: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Check if session already exists
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      // Append events to existing recording
      await ctx.db.patch(existing._id, {
        events: [...existing.events, ...args.events],
        endTime: Date.now(),
        duration: Date.now() - existing.startTime,
      });
      return existing._id;
    }

    // Create new recording
    return await ctx.db.insert("recordings", {
      sessionId: args.sessionId,
      ipAddress: args.ipAddress,
      events: args.events,
      startTime: args.startTime,
      pageUrl: args.pageUrl,
      userAgent: args.userAgent,
      metadata: args.metadata,
      analyzed: false,
    });
  },
});

// Append events to an existing recording
export const appendEvents = mutation({
  args: {
    sessionId: v.string(),
    events: v.array(v.any()),
  },
  handler: async (ctx, { sessionId, events }) => {
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!existing) {
      throw new Error(`Recording not found: ${sessionId}`);
    }

    await ctx.db.patch(existing._id, {
      events: [...existing.events, ...events],
      endTime: Date.now(),
      duration: Date.now() - existing.startTime,
    });

    return existing._id;
  },
});

// Mark a recording as analyzed
export const markAnalyzed = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!existing) {
      throw new Error(`Recording not found: ${sessionId}`);
    }

    await ctx.db.patch(existing._id, { analyzed: true });
    return existing._id;
  },
});

// Save analysis results
export const saveAnalysis = mutation({
  args: {
    sessionId: v.string(),
    analysis: v.object({
      overview: v.string(),
      userIntent: v.string(),
      painPoints: v.array(v.string()),
      recommendations: v.array(v.string()),
      sentiment: v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative"),
        v.literal("frustrated")
      ),
      engagementScore: v.number(),
      keyMoments: v.array(v.object({
        timestamp: v.number(),
        description: v.string(),
      })),
      analyzedAt: v.number(),
    }),
  },
  handler: async (ctx, { sessionId, analysis }) => {
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!existing) {
      throw new Error(`Recording not found: ${sessionId}`);
    }

    await ctx.db.patch(existing._id, {
      analyzed: true,
      analysis,
    });
    return existing._id;
  },
});

// Get recordings pending analysis
export const getPendingAnalysis = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 5 }) => {
    const recordings = await ctx.db
      .query("recordings")
      .withIndex("by_startTime")
      .order("desc")
      .take(50);

    // Filter to recordings that need analysis (either not analyzed, or analyzed but missing analysis data)
    return recordings
      .filter(r => (!r.analyzed || !r.analysis) && r.events.length > 5)
      .slice(0, limit);
  },
});

// Delete a recording
export const remove = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("recordings")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
