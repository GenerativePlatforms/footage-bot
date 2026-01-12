import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    posthogId: v.string(),
    userId: v.optional(v.string()),
    startTime: v.number(), // timestamp
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
  })
    .index("by_posthogId", ["posthogId"])
    .index("by_status", ["status"])
    .index("by_startTime", ["startTime"]),

  notes: defineTable({
    sessionId: v.optional(v.string()),
    type: v.union(
      v.literal("finding"),
      v.literal("recommendation"),
      v.literal("bug"),
      v.literal("ux_issue"),
      v.literal("feature_request"),
      v.literal("pattern")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    title: v.string(),
    description: v.string(),
    affectedSessions: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("acknowledged"),
      v.literal("in_progress"),
      v.literal("resolved")
    ),
    tags: v.array(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"]),

  briefings: defineTable({
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
  }),

  // rrweb session recordings - our own recording system
  recordings: defineTable({
    sessionId: v.string(), // unique session identifier
    ipAddress: v.optional(v.string()), // client IP address
    events: v.array(v.any()), // rrweb events array
    startTime: v.number(),
    endTime: v.optional(v.number()),
    duration: v.optional(v.number()),
    pageUrl: v.string(),
    userAgent: v.string(),
    metadata: v.optional(v.object({
      screenWidth: v.number(),
      screenHeight: v.number(),
      deviceType: v.optional(v.string()),
      browser: v.optional(v.string()),
      os: v.optional(v.string()),
    })),
    analyzed: v.optional(v.boolean()), // whether AI analysis has been run
    analysis: v.optional(v.object({
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
    })),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_ipAddress", ["ipAddress"])
    .index("by_startTime", ["startTime"]),
});
