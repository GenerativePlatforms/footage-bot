import type { UserAnalytics } from '../types/bi';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
const API_BASE = CONVEX_URL.replace('.cloud', '.site') + '/api/supabase-analytics';

export async function getUserAnalytics(): Promise<UserAnalytics> {
  try {
    const response = await fetch(API_BASE);

    if (!response.ok) {
      console.error('Supabase analytics error:', await response.text());
      return {
        newAccounts24h: 0,
        referralBreakdown: [],
        modelBreakdown: [],
        signupsPerDay: [],
        videosPerHour: [],
      };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return {
      newAccounts24h: 0,
      referralBreakdown: [],
      modelBreakdown: [],
      signupsPerDay: [],
      videosPerHour: [],
    };
  }
}
