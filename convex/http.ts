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
      };

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Fetch all data in parallel
      const [accountsRes, referralsRes, modelsRes, signupsRes, videosRes] = await Promise.all([
        // New accounts in last 24h
        fetch(
          `${supabaseUrl}/rest/v1/profiles?select=count&created_at=gte.${twentyFourHoursAgo.toISOString()}`,
          { headers, method: "HEAD" }
        ),
        // Referral breakdown
        fetch(
          `${supabaseUrl}/rest/v1/rpc/get_referral_breakdown`,
          { headers, method: "POST", body: JSON.stringify({}) }
        ),
        // Model breakdown
        fetch(
          `${supabaseUrl}/rest/v1/rpc/get_model_breakdown`,
          { headers, method: "POST", body: JSON.stringify({}) }
        ),
        // Signups per day (last 7 days)
        fetch(
          `${supabaseUrl}/rest/v1/rpc/get_signups_per_day`,
          { headers, method: "POST", body: JSON.stringify({ days: 7 }) }
        ),
        // Videos per hour (last 24h)
        fetch(
          `${supabaseUrl}/rest/v1/rpc/get_videos_per_hour`,
          { headers, method: "POST", body: JSON.stringify({}) }
        ),
      ]);

      const contentRange = accountsRes.headers.get("content-range");
      const newAccounts24h = contentRange ? parseInt(contentRange.split("/")[1] || "0") : 0;

      const [referralBreakdown, modelBreakdown, signupsPerDay, videosPerHour] = await Promise.all([
        referralsRes.ok ? referralsRes.json() : [],
        modelsRes.ok ? modelsRes.json() : [],
        signupsRes.ok ? signupsRes.json() : [],
        videosRes.ok ? videosRes.json() : [],
      ]);

      return new Response(JSON.stringify({
        newAccounts24h,
        referralBreakdown: referralBreakdown || [],
        modelBreakdown: modelBreakdown || [],
        modelMedianTime: [], // Would need another RPC call
        signupsPerDay: signupsPerDay || [],
        videosPerHour: videosPerHour || [],
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Supabase analytics error:", error);
      return new Response(JSON.stringify({
        newAccounts24h: 0,
        referralBreakdown: [],
        modelBreakdown: [],
        modelMedianTime: [],
        signupsPerDay: [],
        videosPerHour: [],
      }), {
        headers: { "Content-Type": "application/json" },
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

      await ctx.runMutation(api.recordings.create, {
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

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      console.error("Recording ingest error:", error);
      return new Response(JSON.stringify({ error: "Failed to ingest recording" }), {
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

export default http;
