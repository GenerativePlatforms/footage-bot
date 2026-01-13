import { useQuery } from 'convex/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import styles from './Sessions.module.css'

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function getSentimentColor(sentiment: string | undefined): string {
  switch (sentiment) {
    case 'positive': return 'var(--sol-green)'
    case 'negative': return 'var(--sol-red)'
    case 'frustrated': return 'var(--sol-orange)'
    default: return 'var(--foreground-muted)'
  }
}

export default function Sessions() {
  const navigate = useNavigate()
  const sessions = useQuery(api.sessions.list)

  if (sessions === undefined) {
    return <div className={styles.loading}>Loading sessions...</div>
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No sessions yet</h2>
        <p>Sync sessions from PostHog to see user recordings.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Session Recordings</h1>
        <span className={styles.count}>{sessions.length} sessions</span>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <div className={styles.col}>Time</div>
          <div className={styles.col}>User</div>
          <div className={styles.col}>Page</div>
          <div className={styles.col}>Duration</div>
          <div className={styles.col}>Status</div>
        </div>

        {sessions.map((session) => (
          <div
            key={session._id}
            className={styles.row}
            onClick={() => navigate(`/sessions/${session.posthogId}`)}
          >
            <div className={styles.col}>
              <span className={styles.time}>{formatTime(session.startTime)}</span>
            </div>
            <div className={styles.col}>
              <span className={styles.url} title={session.userId}>
                {session.userId || 'Anonymous'}
              </span>
            </div>
            <div className={styles.col}>
              <span className={styles.url}>
                {session.pageViews?.[0] || '/'}
              </span>
            </div>
            <div className={styles.col}>
              {formatDuration(session.duration * 1000)}
            </div>
            <div className={styles.col}>
              {session.summary ? (
                <span
                  className={styles.sentiment}
                  style={{ color: getSentimentColor(session.summary.sentiment) }}
                >
                  {session.summary.sentiment}
                </span>
              ) : (
                <span className={styles.notAnalyzed}>{session.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
