import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByPosthogId = query({
  args: { posthogId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_posthogId", (q) => q.eq("posthogId", args.posthogId))
      .first();
  },
});

export const create = mutation({
  args: {
    posthogId: v.string(),
    userId: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    duration: v.number(),
    device: v.object({
      type: v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
      browser: v.string(),
      os: v.string(),
      screenResolution: v.string(),
    }),
    location: v.object({
      country: v.string(),
      city: v.optional(v.string()),
    }),
    events: v.array(v.object({
      id: v.string(),
      timestamp: v.number(),
      type: v.union(
        v.literal("click"),
        v.literal("navigation"),
        v.literal("scroll"),
        v.literal("input"),
        v.literal("error"),
        v.literal("rage_click"),
        v.literal("dead_click"),
        v.literal("console")
      ),
      description: v.string(),
      element: v.optional(v.string()),
      url: v.optional(v.string()),
      severity: v.optional(v.union(v.literal("info"), v.literal("warning"), v.literal("error"))),
      metadata: v.optional(v.any()),
    })),
    summary: v.optional(v.object({
      overview: v.string(),
      userIntent: v.string(),
      painPoints: v.array(v.string()),
      successfulFlows: v.array(v.string()),
      recommendations: v.array(v.string()),
      sentiment: v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative"),
        v.literal("frustrated")
      ),
      engagementScore: v.number(),
    })),
    status: v.union(
      v.literal("watching"),
      v.literal("processing"),
      v.literal("summarized"),
      v.literal("error")
    ),
    pageViews: v.array(v.string()),
    errorCount: v.number(),
    rageClicks: v.number(),
    deadClicks: v.number(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if session already exists
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_posthogId", (q) => q.eq("posthogId", args.posthogId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("sessions", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("sessions"),
    summary: v.optional(v.object({
      overview: v.string(),
      userIntent: v.string(),
      painPoints: v.array(v.string()),
      successfulFlows: v.array(v.string()),
      recommendations: v.array(v.string()),
      sentiment: v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative"),
        v.literal("frustrated")
      ),
      engagementScore: v.number(),
    })),
    status: v.optional(v.union(
      v.literal("watching"),
      v.literal("processing"),
      v.literal("summarized"),
      v.literal("error")
    )),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
