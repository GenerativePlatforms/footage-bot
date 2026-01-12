import type { ChartMogulMetrics } from '../types/bi';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
const API_BASE = CONVEX_URL.replace('.cloud', '.site') + '/api/chartmogul';

interface ChartMogulEntry {
  date: string;
  arr?: number;
  mrr?: number;
  customers?: number;
  'customer-churn-rate'?: number;
  ltv?: number;
}

interface ChartMogulResponse {
  entries?: ChartMogulEntry[];
}

interface ActivityEntry {
  uuid?: string;
  'customer-uuid'?: string;
  'plan-external-id'?: string;
  'activity-mrr'?: number;
  currency?: string;
  date: string;
}

interface ActivitiesResponse {
  entries?: ActivityEntry[];
}

interface CustomerDetails {
  email?: string;
  attributes?: {
    custom?: Record<string, string> | Array<{ key: string; value: string }>;
    stripe?: Record<string, string>;
  };
}

async function chartMogulFetch<T>(endpoint: string): Promise<T | null> {
  const url = `${API_BASE}?endpoint=${encodeURIComponent(endpoint)}`;
  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`ChartMogul API Error: ${response.status} - ${error.message || error.error}`);
  }

  return response.json();
}

export async function getDashboardMetrics(): Promise<ChartMogulMetrics> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const [metricsArr, metricsMrr, metricsChurn, metricsCustomerCount] = await Promise.all([
    chartMogulFetch<ChartMogulResponse>(`/metrics/arr?start-date=${startDateStr}&end-date=${endDateStr}&interval=week`).catch(() => null),
    chartMogulFetch<ChartMogulResponse>(`/metrics/mrr?start-date=${startDateStr}&end-date=${endDateStr}`).catch(() => null),
    chartMogulFetch<ChartMogulResponse>(`/metrics/customer-churn-rate?start-date=${startDateStr}&end-date=${endDateStr}`).catch(() => null),
    chartMogulFetch<ChartMogulResponse>(`/metrics/customer-count?start-date=${startDateStr}&end-date=${endDateStr}`).catch(() => null),
  ]);

  const metricsLtv = await chartMogulFetch<ChartMogulResponse>(`/metrics/ltv?start-date=${startDateStr}&end-date=${endDateStr}`).catch(() => null);

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  const twentyFourHoursAgoStr = twentyFourHoursAgo.toISOString();

  const last24hResponse = await chartMogulFetch<ActivitiesResponse>(
    `/activities?type=new_biz&start-date=${twentyFourHoursAgoStr}&per-page=200&order=-date`
  ).catch(() => null);

  const last24hActivities = last24hResponse?.entries || [];

  const last20Response = await chartMogulFetch<ActivitiesResponse>(
    `/activities?type=new_biz&per-page=20&order=-date`
  ).catch(() => null);

  const last20Activities = last20Response?.entries || [];

  const latestArrCents = metricsArr?.entries?.length ? metricsArr.entries[metricsArr.entries.length - 1].arr ?? 0 : 0;
  const latestMrrCents = metricsMrr?.entries?.length ? metricsMrr.entries[metricsMrr.entries.length - 1].mrr ?? 0 : 0;
  const latestChurn = metricsChurn?.entries?.length ? metricsChurn.entries[metricsChurn.entries.length - 1]['customer-churn-rate'] ?? 0 : 0;
  const latestLtvCents = metricsLtv?.entries?.length ? metricsLtv.entries[metricsLtv.entries.length - 1].ltv ?? 0 : 0;

  const arrGrowthInDollars = metricsArr?.entries?.map(entry => ({
    date: entry.date,
    arr: (entry.arr ?? 0) / 100,
  })) || [];

  const latestCustomerCount = metricsCustomerCount?.entries?.length
    ? metricsCustomerCount.entries[metricsCustomerCount.entries.length - 1].customers ?? 0
    : 0;

  const subscribersOverTime = metricsCustomerCount?.entries?.map(entry => ({
    date: entry.date,
    customers: entry.customers ?? 0,
  })) || [];

  // Enrich activities with customer details
  const enrichedActivities = await Promise.all(
    last20Activities.map(async (activity) => {
      try {
        const customerDetails = await chartMogulFetch<CustomerDetails>(`/customers/${activity['customer-uuid']}`).catch(() => null);

        let source = 'N/A';
        let medium = 'N/A';

        if (customerDetails?.attributes?.custom) {
          const custom = customerDetails.attributes.custom;
          if (Array.isArray(custom)) {
            const sourceAttr = custom.find(attr => attr.key === 'source');
            const mediumAttr = custom.find(attr => attr.key === 'medium');
            if (sourceAttr) source = sourceAttr.value;
            if (mediumAttr) medium = mediumAttr.value;
          } else {
            if (custom.source) source = custom.source;
            if (custom.medium) medium = custom.medium;
          }
        }

        return {
          uuid: activity.uuid,
          email: customerDetails?.email || 'N/A',
          date: activity.date,
          'plan-external-id': activity['plan-external-id'],
          'activity-mrr': activity['activity-mrr'],
          currency: activity.currency,
          source,
          medium,
        };
      } catch {
        return {
          uuid: activity.uuid,
          email: 'N/A',
          date: activity.date,
          'plan-external-id': activity['plan-external-id'],
          'activity-mrr': activity['activity-mrr'],
          currency: activity.currency,
          source: 'N/A',
          medium: 'N/A',
        };
      }
    })
  );

  return {
    mrr: latestMrrCents / 100,
    arr: latestArrCents / 100,
    subscribers: latestCustomerCount,
    subscribersOverTime,
    churnRate: latestChurn,
    ltv: latestLtvCents / 100,
    newCustomers24h: last24hActivities.length,
    arrGrowth: arrGrowthInDollars,
    newSubscriberDetails: enrichedActivities,
  };
}
