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
  const recordings = useQuery(api.recordings.list, { limit: 50 })

  if (recordings === undefined) {
    return <div className={styles.loading}>Loading recordings...</div>
  }

  if (recordings.length === 0) {
    return (
      <div className={styles.empty}>
        <h2>No recordings yet</h2>
        <p>Install the recorder script on your website to start capturing sessions.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Session Recordings</h1>
        <span className={styles.count}>{recordings.length} recordings</span>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <div className={styles.col}>Time</div>
          <div className={styles.col}>Page</div>
          <div className={styles.col}>Duration</div>
          <div className={styles.col}>Events</div>
          <div className={styles.col}>Analysis</div>
        </div>

        {recordings.map((recording) => (
          <div
            key={recording._id}
            className={styles.row}
            onClick={() => navigate(`/sessions/${recording.sessionId}`)}
          >
            <div className={styles.col}>
              <span className={styles.time}>{formatTime(recording.startTime)}</span>
            </div>
            <div className={styles.col}>
              <span className={styles.url} title={recording.pageUrl}>
                {new URL(recording.pageUrl).pathname}
              </span>
            </div>
            <div className={styles.col}>
              {formatDuration(recording.duration)}
            </div>
            <div className={styles.col}>
              {recording.events?.length || 0}
            </div>
            <div className={styles.col}>
              {recording.analysis ? (
                <span
                  className={styles.sentiment}
                  style={{ color: getSentimentColor(recording.analysis.sentiment) }}
                >
                  {recording.analysis.sentiment}
                </span>
              ) : recording.analyzed ? (
                <span className={styles.pending}>pending</span>
              ) : (
                <span className={styles.notAnalyzed}>-</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
