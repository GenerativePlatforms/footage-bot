export interface SubscriberEntry {
  date: string;
  customers: number;
}

export interface ARRGrowthEntry {
  date: string;
  arr: number;
}

export interface SubscriberActivity {
  uuid?: string;
  email?: string;
  date: string;
  'plan-external-id'?: string;
  'activity-mrr'?: number;
  currency?: string;
  source?: string;
  medium?: string;
}

export interface ChartMogulMetrics {
  mrr: number;
  arr: number;
  subscribers: number;
  subscribersOverTime: SubscriberEntry[];
  churnRate: number;
  ltv: number;
  newCustomers24h: number;
  arrGrowth: ARRGrowthEntry[];
  newSubscriberDetails: SubscriberActivity[];
}

export interface ReferralEntry {
  name: string;
  count: number;
  percentage: string;
}

export interface ModelBreakdownEntry {
  model: string;
  count: number;
  percentage: string;
}

export interface SignupEntry {
  date: string;
  count: number;
}

export interface VideoHourEntry {
  hour: string;
  count: number;
}

export interface UserAnalytics {
  newAccounts24h: number;
  referralBreakdown: ReferralEntry[];
  modelBreakdown: ModelBreakdownEntry[];
  signupsPerDay: SignupEntry[];
  videosPerHour: VideoHourEntry[];
}
