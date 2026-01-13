import { useState, useEffect } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line
} from 'recharts';
import { getDashboardMetrics } from '../services/chartmogul';
import { getUserAnalytics } from '../services/supabase';
import type { ChartMogulMetrics, UserAnalytics } from '../types/bi';
import styles from './Dashboard.module.css';

// Solarized colors for charts
const COLORS = {
  blue: '#268bd2',
  cyan: '#2aa198',
  green: '#859900',
  yellow: '#b58900',
  orange: '#cb4b16',
  red: '#dc322f',
  magenta: '#d33682',
  violet: '#6c71c4',
};

const MODEL_COLORS: Record<string, string> = {
  'Kling': COLORS.blue,
  'Veo': COLORS.yellow,
  'Seedance': COLORS.green,
  'Sora': COLORS.red,
  'Wan': COLORS.violet,
  'Runway': COLORS.magenta,
  'Pika': COLORS.cyan,
  'Luma': COLORS.orange,
  'Unknown': '#586e75',
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
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<ChartMogulMetrics | null>(null);
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading metrics...</div>;
  }

  const conversionRate = userAnalytics?.newAccounts24h
    ? ((metrics?.newCustomers24h || 0) / userAnalytics.newAccounts24h * 100).toFixed(1)
    : '0.0';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Business Metrics</h1>
        <button onClick={fetchData} className={styles.refreshButton}>Refresh</button>
      </div>

      {/* Top Metrics Row */}
      <div className={styles.metricsRow}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Monthly Recurring Revenue</div>
          <div className={styles.metricValue}>{formatCurrency(metrics?.mrr || 0)}</div>
          <div className={styles.metricSource}>ChartMogul</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Annual Recurring Revenue</div>
          <div className={styles.metricValue}>{formatCurrency(metrics?.arr || 0)}</div>
          <div className={styles.metricSource}>ChartMogul</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Total Subscribers</div>
          <div className={styles.metricValue}>{metrics?.subscribers || 0}</div>
          <div className={styles.metricSource}>ChartMogul</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Churn Rate</div>
          <div className={styles.metricValue}>{(metrics?.churnRate || 0).toFixed(1)}%</div>
          <div className={styles.metricSource}>ChartMogul</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Paid Trials (24h)</div>
          <div className={styles.metricValue}>{metrics?.newCustomers24h || 0}</div>
          <div className={styles.metricSource}>ChartMogul</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Free Signups (24h)</div>
          <div className={styles.metricValue}>{userAnalytics?.newAccounts24h || 0}</div>
          <div className={styles.metricSource}>Supabase</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        {/* ARR Growth */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            ARR Growth
          </div>
          <div className={styles.chartBody}>
            {metrics?.arrGrowth && metrics.arrGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={metrics.arrGrowth}>
                  <defs>
                    <linearGradient id="arrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <YAxis tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#073642', border: '1px solid #586e75', fontSize: 11 }}
                    formatter={(value) => [formatCurrency(Number(value)), 'ARR']}
                  />
                  <Area type="monotone" dataKey="arr" stroke={COLORS.cyan} strokeWidth={2} fill="url(#arrGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}>No ARR data available</div>
            )}
          </div>
        </div>

        {/* Subscribers Over Time */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            Subscribers Over Time
            <span className={styles.chartSubtitle}>{metrics?.subscribers || 0} total</span>
          </div>
          <div className={styles.chartBody}>
            {metrics?.subscribersOverTime && metrics.subscribersOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={metrics.subscribersOverTime}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <YAxis tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <Tooltip contentStyle={{ background: '#073642', border: '1px solid #586e75', fontSize: 11 }} />
                  <Line type="monotone" dataKey="customers" stroke={COLORS.green} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}>No subscriber data available</div>
            )}
          </div>
        </div>

        {/* New Signups Per Day */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            New Signups Per Day
            <span className={styles.chartSubtitle}>Last 30 days</span>
          </div>
          <div className={styles.chartBody}>
            {userAnalytics?.signupsPerDay && userAnalytics.signupsPerDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={userAnalytics.signupsPerDay}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <YAxis tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <Tooltip contentStyle={{ background: '#073642', border: '1px solid #586e75', fontSize: 11 }} />
                  <Bar dataKey="count" fill={COLORS.red} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}>No signup data available</div>
            )}
          </div>
        </div>

        {/* Videos Per Hour */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            Videos Created Per Hour
            <span className={styles.chartSubtitle}>Last 72 hours</span>
          </div>
          <div className={styles.chartBody}>
            {userAnalytics?.videosPerHour && userAnalytics.videosPerHour.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={userAnalytics.videosPerHour}>
                  <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#93a1a1' }} stroke="#586e75" />
                  <YAxis tick={{ fontSize: 9, fill: '#93a1a1' }} stroke="#586e75" />
                  <Tooltip contentStyle={{ background: '#073642', border: '1px solid #586e75', fontSize: 11 }} />
                  <Bar dataKey="count" fill={COLORS.magenta} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}>No video data available</div>
            )}
          </div>
        </div>

        {/* Video Model Distribution */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            Video Model Distribution
            <span className={styles.chartSubtitle}>Last 1,000 videos</span>
          </div>
          <div className={styles.chartBody}>
            {userAnalytics?.modelBreakdown && userAnalytics.modelBreakdown.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={userAnalytics.modelBreakdown}
                      dataKey="count"
                      nameKey="model"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                    >
                      {userAnalytics.modelBreakdown.map((entry) => (
                        <Cell key={entry.model} fill={MODEL_COLORS[entry.model] || '#586e75'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#073642', border: '1px solid #586e75', fontSize: 11 }}
                      formatter={(value, _, props) => [`${value}`, props.payload.model]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.legendGrid}>
                  {userAnalytics.modelBreakdown.slice(0, 6).map((entry) => (
                    <div key={entry.model} className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ background: MODEL_COLORS[entry.model] || '#586e75' }} />
                      <span className={styles.legendLabel}>{entry.model}</span>
                      <span className={styles.legendValue}>{entry.percentage}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.noData}>No model data available</div>
            )}
          </div>
        </div>

        {/* New Accounts Referrals */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            New Accounts Referrals
            <span className={styles.chartSubtitle}>Last 100 signups</span>
          </div>
          <div className={styles.chartBody}>
            {userAnalytics?.referralBreakdown && userAnalytics.referralBreakdown.length > 0 ? (
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
            ) : (
              <div className={styles.noData}>No referral data available</div>
            )}
          </div>
        </div>

        {/* Model Generation Time - NEW CHART */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            Model Generation Time
            <span className={styles.chartSubtitle}>Median seconds</span>
          </div>
          <div className={styles.chartBody}>
            {userAnalytics?.modelMedianTime && userAnalytics.modelMedianTime.length > 0 ? (
              <div className={styles.modelTimeList}>
                {userAnalytics.modelMedianTime.slice(0, 8).map((item) => {
                  const maxTime = Math.max(...userAnalytics.modelMedianTime.map(m => m.medianSeconds));
                  return (
                    <div key={item.model} className={styles.modelTimeItem}>
                      <span className={styles.modelTimeName}>{item.model}</span>
                      <div className={styles.modelTimeBar}>
                        <div
                          className={styles.modelTimeFill}
                          style={{ width: `${(item.medianSeconds / maxTime) * 100}%` }}
                        />
                      </div>
                      <span className={styles.modelTimeValue}>{formatTime(item.medianSeconds)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.noData}>No generation time data available</div>
            )}
          </div>
        </div>

        {/* Conversion Funnel - NEW CHART */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            Signup → Paid Conversion
            <span className={styles.chartSubtitle}>Last 24 hours</span>
          </div>
          <div className={styles.chartBody}>
            <div className={styles.metricCard} style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className={styles.metricLabel}>Conversion Rate</div>
              <div className={styles.metricValue} style={{ color: COLORS.green, fontSize: 36 }}>{conversionRate}%</div>
              <div className={styles.metricSubtext}>
                {metrics?.newCustomers24h || 0} paid trials from {userAnalytics?.newAccounts24h || 0} signups
              </div>
              <div className={styles.conversionBar}>
                <div
                  className={styles.conversionFill}
                  style={{ width: `${Math.min(parseFloat(conversionRate), 100)}%` }}
                />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <div className={styles.metricLabel}>Customer Lifetime Value</div>
              <div className={styles.metricValueSmall} style={{ color: COLORS.yellow }}>
                {formatCurrency(metrics?.ltv || 0)}
              </div>
              <div className={styles.metricSource}>ChartMogul</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
