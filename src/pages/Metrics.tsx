import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { getDashboardMetrics } from '../services/chartmogul';
import { getUserAnalytics } from '../services/supabase';
import type { ChartMogulMetrics, UserAnalytics } from '../types/bi';
import styles from './Metrics.module.css';

// Colors matching savoir dashboard
const MODEL_COLORS: Record<string, string> = {
  'Kling': '#6366f1',
  'Veo': '#f59e0b',
  'Seedance': '#10b981',
  'Sora': '#ef4444',
  'Wan': '#8b5cf6',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function Metrics() {
  const [metrics, setMetrics] = useState<ChartMogulMetrics | null>(null);
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [metricsData, analyticsData] = await Promise.all([
          getDashboardMetrics().catch(() => null),
          getUserAnalytics().catch(() => null),
        ]);
        setMetrics(metricsData);
        setUserAnalytics(analyticsData);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading metrics...</div>
      </div>
    );
  }

  const conversionRate = userAnalytics?.newAccounts24h
    ? ((metrics?.newCustomers24h || 0) / userAnalytics.newAccounts24h * 100).toFixed(1)
    : '0.0';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Footage Dashboard</h1>

      <div className={styles.grid}>
        {/* Left Column */}
        <div className={styles.column}>
          {/* ARR & MRR Cards */}
          <div className={styles.row}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardLabel}>Annual Recurring Revenue</span>
                <span className={styles.cardIcon}>📈</span>
              </div>
              <div className={styles.cardValue}>{formatCurrency(metrics?.arr || 0)}</div>
              <div className={styles.cardSource}>Source: ChartMogul</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardLabel}>Monthly Recurring Revenue</span>
                <span className={styles.cardIcon}>💵</span>
              </div>
              <div className={styles.cardValue}>{formatCurrency(metrics?.mrr || 0)}</div>
              <div className={styles.cardSource}>Source: ChartMogul</div>
            </div>
          </div>

          {/* Total Subscribers */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Total Subscribers</div>
            <div className={styles.cardValueLarge}>{metrics?.subscribers || 0}</div>
            {metrics?.subscribersOverTime && metrics.subscribersOverTime.length > 0 && (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={metrics.subscribersOverTime}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis hide />
                  <Bar dataKey="customers" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className={styles.cardSource}>Source: ChartMogul</div>
          </div>

          {/* Weekly ARR Growth */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Weekly ARR Growth Over Time</div>
            {metrics?.arrGrowth && metrics.arrGrowth.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={metrics.arrGrowth}>
                  <defs>
                    <linearGradient id="arrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'ARR']} />
                  <Area
                    type="monotone"
                    dataKey="arr"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#arrGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* New Free Signups Per Day */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>New Free Signups Per Day (Last 30 Days)</div>
            {userAnalytics?.signupsPerDay && userAnalytics.signupsPerDay.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={userAnalytics.signupsPerDay}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f87171" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className={styles.cardSource}>Source: Supabase</div>
          </div>
        </div>

        {/* Right Column */}
        <div className={styles.column}>
          {/* Conversion Rate */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Signup → Paid Conversion (Last 24h)</div>
            <div className={styles.conversionValue}>{conversionRate}%</div>
            <div className={styles.conversionDetail}>
              <strong>{metrics?.newCustomers24h || 0} paid trials</strong>
            </div>
            <div className={styles.conversionSubtext}>
              out of {userAnalytics?.newAccounts24h || 0} signups in last 24 hours
            </div>
            <div className={styles.conversionBar}>
              <div
                className={styles.conversionFill}
                style={{ width: `${Math.min(parseFloat(conversionRate), 100)}%` }}
              />
            </div>
            <div className={styles.cardSource}>Source: Combined (Supabase + ChartMogul)</div>
          </div>

          {/* Referrals */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>New Accounts Referrals (Last 100)</div>
            {userAnalytics?.referralBreakdown && userAnalytics.referralBreakdown.length > 0 && (
              <div className={styles.referralList}>
                {userAnalytics.referralBreakdown.slice(0, 8).map((ref, i) => (
                  <div key={i} className={styles.referralItem}>
                    <div className={styles.referralName}>{ref.name}</div>
                    <div className={styles.referralValue}>{ref.count} ({ref.percentage})</div>
                    <div className={styles.referralBarContainer}>
                      <div
                        className={styles.referralBar}
                        style={{ width: `${(ref.count / (userAnalytics.referralBreakdown[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.cardSource}>Source: Supabase</div>
          </div>

          {/* Video Model Distribution */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Video Model Distribution</div>
            <div className={styles.cardSubLabel}>Last 1,000 videos by AI model</div>
            {userAnalytics?.modelBreakdown && userAnalytics.modelBreakdown.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={userAnalytics.modelBreakdown}
                      dataKey="count"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                    >
                      {userAnalytics.modelBreakdown.map((entry) => (
                        <Cell
                          key={entry.model}
                          fill={MODEL_COLORS[entry.model] || '#94a3b8'}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _, props) => [`${value}`, props.payload.model]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.legendGrid}>
                  {userAnalytics.modelBreakdown.map((entry) => (
                    <div key={entry.model} className={styles.legendItem}>
                      <span
                        className={styles.legendDot}
                        style={{ background: MODEL_COLORS[entry.model] || '#94a3b8' }}
                      />
                      <span className={styles.legendLabel}>{entry.model}</span>
                      <span className={styles.legendValue}>{entry.percentage}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={styles.cardSource}>Source: Supabase</div>
          </div>

          {/* Median Generation Time */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Median Generation Time by Model</div>
            <div className={styles.cardSubLabel}>Based on last 1,000 videos</div>
            {userAnalytics?.modelMedianTime && userAnalytics.modelMedianTime.length > 0 && (
              <div className={styles.timeBarList}>
                {userAnalytics.modelMedianTime.map((item) => (
                  <div key={item.model} className={styles.timeBarItem}>
                    <div className={styles.timeBarLabel}>{item.model}</div>
                    <div className={styles.timeBarContainer}>
                      <div
                        className={styles.timeBar}
                        style={{
                          width: `${Math.min((item.medianSeconds / 240) * 100, 100)}%`,
                          background: MODEL_COLORS[item.model] || '#94a3b8'
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className={styles.timeAxis}>
                  <span>0s</span>
                  <span>1m</span>
                  <span>2m</span>
                  <span>3m</span>
                  <span>4m</span>
                </div>
              </div>
            )}
            <div className={styles.cardSource}>Source: Supabase</div>
          </div>

          {/* Videos Per Hour */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>Videos Created Per Hour (Last 72 Hours)</div>
            {userAnalytics?.videosPerHour && userAnalytics.videosPerHour.length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={userAnalytics.videosPerHour}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className={styles.cardSource}>Source: Supabase</div>
          </div>
        </div>
      </div>
    </div>
  );
}
