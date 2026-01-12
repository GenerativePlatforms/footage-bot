import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { getDashboardMetrics } from '../services/chartmogul';
import { getUserAnalytics } from '../services/supabase';
import type { ChartMogulMetrics, UserAnalytics } from '../types/bi';
import styles from './Metrics.module.css';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardValue}>{value}</div>
      {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
    </div>
  );
}

export default function Metrics() {
  const [metrics, setMetrics] = useState<ChartMogulMetrics | null>(null);
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [metricsData, analyticsData] = await Promise.all([
        getDashboardMetrics().catch(err => {
          console.error('ChartMogul error:', err);
          return null;
        }),
        getUserAnalytics().catch(err => {
          console.error('Supabase error:', err);
          return null;
        }),
      ]);

      setMetrics(metricsData);
      setUserAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
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

  if (error) {
    return (
      <div className={styles.error}>
        <h2>Error Loading Data</h2>
        <p>{error}</p>
        <button onClick={fetchData} className={styles.retryButton}>Try Again</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Business Metrics</h1>
        <button onClick={fetchData} className={styles.refreshButton}>Refresh</button>
      </div>

      {/* Top Metrics */}
      <div className={styles.metricsGrid}>
        <MetricCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(metrics?.mrr || 0)}
          subtitle="ChartMogul"
        />
        <MetricCard
          title="Annual Recurring Revenue"
          value={formatCurrency(metrics?.arr || 0)}
          subtitle="ChartMogul"
        />
        <MetricCard
          title="New Paid Customers (24h)"
          value={String(metrics?.newCustomers24h || 0)}
          subtitle="ChartMogul"
        />
        <MetricCard
          title="New Free Signups (24h)"
          value={String(userAnalytics?.newAccounts24h || 0)}
          subtitle="Supabase"
        />
      </div>

      {/* Charts */}
      <div className={styles.chartsGrid}>
        {/* ARR Growth */}
        {metrics?.arrGrowth && metrics.arrGrowth.length > 0 && (
          <div className={styles.chartCard}>
            <h3>ARR Growth</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.arrGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }}
                  formatter={(value) => [formatCurrency(Number(value)), 'ARR']}
                />
                <Line type="monotone" dataKey="arr" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Subscribers Over Time */}
        {metrics?.subscribersOverTime && metrics.subscribersOverTime.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Subscribers ({metrics.subscribers} total)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.subscribersOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }}
                />
                <Line type="monotone" dataKey="customers" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Signups Per Day */}
        {userAnalytics?.signupsPerDay && userAnalytics.signupsPerDay.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Signups Per Day</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.signupsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }}
                />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Referral Breakdown */}
        {userAnalytics?.referralBreakdown && userAnalytics.referralBreakdown.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Referral Sources</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={userAnalytics.referralBreakdown.map(r => ({ ...r, name: r.name, count: r.count }))}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                >
                  {userAnalytics.referralBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Model Breakdown */}
        {userAnalytics?.modelBreakdown && userAnalytics.modelBreakdown.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Model Usage</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.modelBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" stroke="#71717a" fontSize={12} />
                <YAxis type="category" dataKey="model" stroke="#71717a" fontSize={12} width={100} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }} />
                <Bar dataKey="count" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Videos Per Hour */}
        {userAnalytics?.videosPerHour && userAnalytics.videosPerHour.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Videos Per Hour (Last 24h)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.videosPerHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="hour" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a' }} />
                <Bar dataKey="count" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* New Subscribers Table */}
      {metrics?.newSubscriberDetails && metrics.newSubscriberDetails.length > 0 && (
        <div className={styles.tableSection}>
          <h3>Recent New Subscribers</h3>
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <div>Email</div>
              <div>Plan</div>
              <div>MRR</div>
              <div>Source</div>
              <div>Date</div>
            </div>
            {metrics.newSubscriberDetails.map((sub, i) => (
              <div key={sub.uuid || i} className={styles.tableRow}>
                <div>{sub.email}</div>
                <div>{sub['plan-external-id'] || '-'}</div>
                <div>{sub['activity-mrr'] ? formatCurrency(sub['activity-mrr'] / 100) : '-'}</div>
                <div>{sub.source}</div>
                <div>{new Date(sub.date).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
