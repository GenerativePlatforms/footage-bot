import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// ChartMogul proxy
http.route({
  path: "/api/chartmogul",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get("endpoint");

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "Missing endpoint parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.CHARTMOGUL_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ChartMogul API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const chartMogulUrl = `https://api.chartmogul.com/v1${endpoint}`;
      const response = await fetch(chartMogulUrl, {
        headers: {
          Authorization: `Basic ${btoa(apiKey + ":")}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to fetch from ChartMogul" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Supabase analytics proxy
http.route({
  path: "/api/supabase-analytics",
  method: "GET",
  handler: httpAction(async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Supabase not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      };

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

      // Fetch users from auth.users via Admin API (paginated)
      let allUsers: Array<{ created_at: string; user_metadata?: { source?: string; medium?: string } }> = [];
      let page = 1;
      const perPage = 1000;
      let hasMore = true;

      while (hasMore) {
        const usersRes = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
          { headers }
        );

        if (!usersRes.ok) {
          console.error("Failed to fetch users:", await usersRes.text());
          break;
        }

        const usersData = await usersRes.json();
        const pageUsers = usersData.users || [];

        if (pageUsers.length === 0) {
          hasMore = false;
          break;
        }

        allUsers = allUsers.concat(pageUsers);

        // Check if oldest user is older than 30 days or we got fewer than perPage
        const oldestInPage = pageUsers.reduce((oldest: Date, user: { created_at: string }) => {
          const userDate = new Date(user.created_at);
          return userDate < oldest ? userDate : oldest;
        }, new Date());

        if (oldestInPage < thirtyDaysAgo || pageUsers.length < perPage) {
          hasMore = false;
        } else {
          page++;
          if (page > 20) hasMore = false; // Safety limit
        }
      }

      // Fetch video data in parallel
      const [videosRes, videosHourlyRes] = await Promise.all([
        // Model breakdown - get last 1000 videos with model info
        fetch(
          `${supabaseUrl}/rest/v1/videos?select=model&order=created_at.desc&limit=1000`,
          { headers }
        ),
        // Videos per hour - get videos from last 72 hours
        fetch(
          `${supabaseUrl}/rest/v1/videos?select=created_at&created_at=gte.${seventyTwoHoursAgo.toISOString()}&order=created_at.asc`,
          { headers }
        ),
      ]);

      // Process new accounts in last 24h
      const newAccountsList = allUsers.filter(u => new Date(u.created_at) > twentyFourHoursAgo);
      const newAccounts24h = newAccountsList.length;

      // Process referral breakdown from last 100 signups
      const last100Signups = allUsers
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);

      let referralBreakdown: { name: string; count: number; percentage: string }[] = [];
      const refCounts: Record<string, number> = {};
      for (const user of last100Signups) {
        const source = user.user_metadata?.source || 'direct';
        const medium = user.user_metadata?.medium || 'none';
        const key = `${source} / ${medium}`;
        refCounts[key] = (refCounts[key] || 0) + 1;
      }
      const total = last100Signups.length;
      referralBreakdown = Object.entries(refCounts)
        .map(([name, count]) => ({
          name,
          count,
          percentage: `${((count / total) * 100).toFixed(1)}%`,
        }))
        .sort((a, b) => b.count - a.count);

      // Process signups per day from last 30 days
      const signupsPerDayCounts: Record<string, number> = {};
      for (const user of allUsers) {
        const date = new Date(user.created_at);
        if (date >= thirtyDaysAgo) {
          const dayKey = date.toISOString().split('T')[0];
          signupsPerDayCounts[dayKey] = (signupsPerDayCounts[dayKey] || 0) + 1;
        }
      }
      const signupsPerDay = Object.entries(signupsPerDayCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Process model breakdown
      let modelBreakdown: { model: string; count: number; percentage: string }[] = [];
      if (videosRes.ok) {
        const videos = await videosRes.json();
        const modelCounts: Record<string, number> = {};

        // Simplify model names
        const simplifyModel = (model: string): string => {
          if (!model) return 'Unknown';
          const lower = model.toLowerCase();
          if (lower.includes('kling')) return 'Kling';
          if (lower.includes('veo')) return 'Veo';
          if (lower.includes('seedance')) return 'Seedance';
          if (lower.includes('sora')) return 'Sora';
          if (lower.includes('wan')) return 'Wan';
          if (lower.includes('runway')) return 'Runway';
          if (lower.includes('pika')) return 'Pika';
          if (lower.includes('luma')) return 'Luma';
          return model.split('/')[0] || model;
        };

        for (const v of videos) {
          const model = simplifyModel(v.model);
          modelCounts[model] = (modelCounts[model] || 0) + 1;
        }
        const total = videos.length;
        modelBreakdown = Object.entries(modelCounts)
          .map(([model, count]) => ({
            model,
            count,
            percentage: `${((count / total) * 100).toFixed(1)}%`,
          }))
          .sort((a, b) => b.count - a.count);
      }

      // Process videos per hour
      let videosPerHour: { hour: string; count: number }[] = [];
      if (videosHourlyRes.ok) {
        const videos = await videosHourlyRes.json();
        const hourCounts: Record<string, number> = {};
        for (const v of videos) {
          const d = new Date(v.created_at);
          const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
          const hour = `${dayName} ${d.getHours().toString().padStart(2, '0')}:00`;
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
        videosPerHour = Object.entries(hourCounts)
          .map(([hour, count]) => ({ hour, count }));
      }

      return new Response(JSON.stringify({
        newAccounts24h,
        referralBreakdown,
        modelBreakdown,
        modelMedianTime: [],
        signupsPerDay,
        videosPerHour,
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Supabase analytics error:", error);
      return new Response(JSON.stringify({
        error: String(error),
        newAccounts24h: 0,
        referralBreakdown: [],
        modelBreakdown: [],
        modelMedianTime: [],
        signupsPerDay: [],
        videosPerHour: [],
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

// Ramp API proxy
http.route({
  path: "/api/ramp",
  method: "GET",
  handler: httpAction(async () => {
    const clientId = process.env.RAMP_CLIENT_ID;
    const clientSecret = process.env.RAMP_CLIENT_SECRET;
    const refreshToken = process.env.RAMP_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(JSON.stringify({
        error: "Ramp not configured",
        balance: 0,
        limit: 0
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    try {
      // Get access token using refresh token
      const tokenResponse = await fetch("https://api.ramp.com/developer/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to get Ramp access token");
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Get spend limits/balance
      const limitsResponse = await fetch("https://api.ramp.com/developer/v1/business/balance", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!limitsResponse.ok) {
        // Try alternative endpoint for card balance
        const cardsResponse = await fetch("https://api.ramp.com/developer/v1/cards", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (cardsResponse.ok) {
          const cardsData = await cardsResponse.json();
          // Sum up card limits and balances
          let totalLimit = 0;
          let totalSpent = 0;

          if (cardsData.data && Array.isArray(cardsData.data)) {
            for (const card of cardsData.data) {
              totalLimit += card.spending_restrictions?.amount || 0;
              totalSpent += card.current_spend_amount || 0;
            }
          }

          return new Response(JSON.stringify({
            balance: (totalLimit - totalSpent) / 100,
            limit: totalLimit / 100,
            spent: totalSpent / 100,
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        throw new Error("Failed to get Ramp balance");
      }

      const balanceData = await limitsResponse.json();

      return new Response(JSON.stringify({
        balance: (balanceData.balance || 0) / 100,
        limit: (balanceData.limit || 0) / 100,
        spent: (balanceData.spent || 0) / 100,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("Ramp API error:", error);
      return new Response(JSON.stringify({
        error: "Failed to fetch Ramp data",
        balance: 0,
        limit: 0,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/api/ramp",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// CORS preflight
http.route({
  path: "/api/chartmogul",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/api/supabase-analytics",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// Recordings ingest endpoint
http.route({
  path: "/api/recordings/ingest",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { sessionId, events, metadata } = body;

      if (!sessionId || !events) {
        return new Response(JSON.stringify({ error: "Missing sessionId or events" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Get IP from request headers
      const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                        request.headers.get("x-real-ip") ||
                        "unknown";

      console.log("Recording ingest - sessionId:", sessionId, "events:", events.length);

      const result = await ctx.runMutation(api.recordings.create, {
        sessionId,
        ipAddress,
        events,
        startTime: metadata?.startTime || Date.now(),
        pageUrl: metadata?.pageUrl || "unknown",
        userAgent: metadata?.userAgent || "unknown",
        metadata: metadata ? {
          screenWidth: metadata.screenWidth || 0,
          screenHeight: metadata.screenHeight || 0,
          deviceType: metadata.deviceType,
          browser: metadata.browser,
          os: metadata.os,
        } : undefined,
      });

      console.log("Recording ingest - result:", result);

      return new Response(JSON.stringify({ success: true, id: result }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("Recording ingest error:", error);
      return new Response(JSON.stringify({
        error: "Failed to ingest recording",
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/api/recordings/ingest",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// PostHog sync endpoint - fetch directly in httpAction to avoid env var issues
http.route({
  path: "/api/posthog/sync",
  method: "POST",
  handler: httpAction(async (ctx) => {
    // Hardcode for now since env var has issues
    const apiKey = "phx_P1klFvj87AOndrES2p6txean9oUCGGr6GObTrcgfyAdahAv";

    try {
      const url = "https://us.posthog.com/api/projects/198125/session_recordings/?limit=50";
      const response = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`PostHog API error: ${response.status}`);
      }

      const data = await response.json();
      const results = [];

      for (const rec of data.results) {
        try {
          const pageUrl = new URL(rec.start_url);
          const mutationResult = await ctx.runMutation(api.sessions.create, {
            posthogId: rec.id,
            userId: rec.person?.name || rec.distinct_id,
            startTime: new Date(rec.start_time).getTime(),
            endTime: new Date(rec.end_time).getTime(),
            duration: rec.recording_duration,
            device: {
              type: "desktop" as "desktop" | "mobile" | "tablet",
              browser: "Unknown",
              os: "Unknown",
              screenResolution: "Unknown",
            },
            location: { country: "Unknown" },
            events: [],
            status: "watching" as "watching" | "processing" | "summarized" | "error",
            pageViews: [pageUrl.pathname],
            errorCount: rec.console_error_count || 0,
            rageClicks: 0,
            deadClicks: 0,
            tags: [],
          });
          console.log("Stored session:", rec.id, "result:", mutationResult);
          results.push({ id: rec.id, status: "stored", docId: mutationResult });
        } catch (e) {
          results.push({ id: rec.id, status: "error", error: String(e) });
        }
      }

      return new Response(JSON.stringify({ count: data.results.length, results }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("PostHog sync error:", error);
      return new Response(JSON.stringify({
        error: "Failed to sync PostHog recordings",
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }),
});

http.route({
  path: "/api/posthog/sync",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
