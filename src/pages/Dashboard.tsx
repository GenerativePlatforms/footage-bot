import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { getDashboardMetrics } from '../services/chartmogul';
import { getUserAnalytics } from '../services/supabase';
import type { ChartMogulMetrics, UserAnalytics } from '../types/bi';
import styles from './Dashboard.module.css';

// Solarized accent colors
const COLORS = ['#268bd2', '#859900', '#b58900', '#dc322f', '#6c71c4', '#d33682'];

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

export default function Dashboard() {
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
        <MetricCard
          title="Signup → Paid Conversion"
          value={userAnalytics?.newAccounts24h ? `${(((metrics?.newCustomers24h || 0) / userAnalytics.newAccounts24h) * 100).toFixed(1)}%` : '0%'}
          subtitle={`${metrics?.newCustomers24h || 0} paid / ${userAnalytics?.newAccounts24h || 0} signups`}
        />
        <MetricCard
          title="Total Subscribers"
          value={String(metrics?.subscribers || 0)}
          subtitle="ChartMogul"
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e0dcc7" />
                <XAxis dataKey="date" stroke="#93a1a1" fontSize={11} />
                <YAxis stroke="#93a1a1" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }}
                  formatter={(value) => [formatCurrency(Number(value)), 'ARR']}
                />
                <Line type="monotone" dataKey="arr" stroke="#268bd2" strokeWidth={2} dot={false} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e0dcc7" />
                <XAxis dataKey="date" stroke="#93a1a1" fontSize={11} />
                <YAxis stroke="#93a1a1" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }}
                />
                <Line type="monotone" dataKey="customers" stroke="#859900" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Signups Per Day */}
        {userAnalytics?.signupsPerDay && userAnalytics.signupsPerDay.length > 0 && (
          <div className={styles.chartCard}>
            <h3>New Free Signups Per Day</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.signupsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0dcc7" />
                <XAxis dataKey="date" stroke="#93a1a1" fontSize={11} />
                <YAxis stroke="#93a1a1" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }}
                />
                <Bar dataKey="count" fill="#6c71c4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Referral Breakdown - Horizontal Bar */}
        {userAnalytics?.referralBreakdown && userAnalytics.referralBreakdown.length > 0 && (
          <div className={styles.chartCard}>
            <h3>New Accounts Referrals (Last 100)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.referralBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e0dcc7" />
                <XAxis type="number" stroke="#93a1a1" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#93a1a1" fontSize={11} width={100} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }}
                  formatter={(value, _, props) => [`${value} (${props.payload.percentage})`, 'Count']}
                />
                <Bar dataKey="count" fill="#268bd2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Model Breakdown - Donut Chart */}
        {userAnalytics?.modelBreakdown && userAnalytics.modelBreakdown.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Video Model Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={userAnalytics.modelBreakdown.map(m => ({ ...m, name: m.model }))}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                >
                  {userAnalytics.modelBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }}
                  formatter={(value, _, props) => [`${value} (${props.payload.percentage})`, props.payload.name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Videos Per Hour */}
        {userAnalytics?.videosPerHour && userAnalytics.videosPerHour.length > 0 && (
          <div className={styles.chartCard}>
            <h3>Videos Per Hour (Last 24h)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={userAnalytics.videosPerHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0dcc7" />
                <XAxis dataKey="hour" stroke="#93a1a1" fontSize={11} />
                <YAxis stroke="#93a1a1" fontSize={11} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e0dcc7', color: '#657b83' }} />
                <Bar dataKey="count" fill="#d33682" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
}
