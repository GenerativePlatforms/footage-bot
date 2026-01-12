import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("briefings")
      .order("desc")
      .first();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("briefings")
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    summary: v.string(),
    recommendations: v.array(v.object({
      priority: v.union(
        v.literal("critical"),
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      ),
      title: v.string(),
      description: v.string(),
      affectedUsers: v.number(),
      category: v.union(
        v.literal("bug"),
        v.literal("ux"),
        v.literal("performance"),
        v.literal("feature")
      ),
    })),
    patterns: v.array(v.object({
      issue: v.string(),
      count: v.number(),
    })),
    overallSentiment: v.union(
      v.literal("positive"),
      v.literal("neutral"),
      v.literal("negative"),
      v.literal("mixed")
    ),
    sessionsAnalyzed: v.number(),
    generatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("briefings", args);
  },
});

export const remove = mutation({
  args: { id: v.id("briefings") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const briefings = await ctx.db.query("briefings").collect();
    for (const briefing of briefings) {
      await ctx.db.delete(briefing._id);
    }
  },
});
