import { useQuery } from 'convex/react'
import { useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { api } from '../../convex/_generated/api'
import styles from './Sessions.module.css'

const ITEMS_PER_PAGE = 25

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated'

function getSentimentStyle(sentiment: Sentiment | undefined): { bg: string; color: string; label: string } {
  switch (sentiment) {
    case 'positive': return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'Happy' }
    case 'neutral': return { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308', label: 'Neutral' }
    case 'negative': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Unhappy' }
    case 'frustrated': return { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316', label: 'Frustrated' }
    default: return { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', label: 'Pending' }
  }
}

export default function Sessions() {
  const navigate = useNavigate()
  const sessions = useQuery(api.sessions.list)
  const [currentPage, setCurrentPage] = useState(1)

  // Sort by most recent first and paginate
  const { sortedSessions, totalPages, displayedSessions } = useMemo(() => {
    if (!sessions) return { sortedSessions: [], totalPages: 0, displayedSessions: [] }

    const sorted = [...sessions].sort((a, b) => b.startTime - a.startTime)
    const total = Math.ceil(sorted.length / ITEMS_PER_PAGE)
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    const displayed = sorted.slice(start, start + ITEMS_PER_PAGE)

    return { sortedSessions: sorted, totalPages: total, displayedSessions: displayed }
  }, [sessions, currentPage])

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

  const analyzedCount = sortedSessions.filter(s => s.summary).length
  const frustratedCount = sortedSessions.filter(s => s.summary?.sentiment === 'frustrated').length

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Sessions</h1>
        <div className={styles.stats}>
          <span className={styles.statTotal}>{sessions.length} total</span>
          <span className={styles.statAnalyzed}>{analyzedCount} analyzed</span>
          {frustratedCount > 0 && (
            <span className={styles.statFrustrated}>{frustratedCount} frustrated</span>
          )}
        </div>
      </div>

      <div className={styles.list}>
        <div className={styles.listHeader}>
          <div className={styles.colUser}>User</div>
          <div className={styles.colTime}>Time</div>
          <div className={styles.colDuration}>Duration</div>
          <div className={styles.colPage}>Page</div>
          <div className={styles.colStatus}>Status</div>
          <div className={styles.colScore}>Score</div>
        </div>

        {displayedSessions.map((session) => {
          const sentiment = session.summary?.sentiment as Sentiment | undefined
          const style = getSentimentStyle(sentiment)
          const hasErrors = (session.errorCount || 0) > 0

          return (
            <div
              key={session._id}
              className={styles.row}
              onClick={() => navigate(`/sessions/${session.posthogId}`)}
            >
              <div className={styles.colUser}>
                <span className={styles.userEmail}>{session.userId || 'Anonymous'}</span>
                {session.summary?.overview && (
                  <span className={styles.overview}>{session.summary.overview}</span>
                )}
              </div>
              <div className={styles.colTime}>{getRelativeTime(session.startTime)}</div>
              <div className={styles.colDuration}>
                {formatDuration(session.duration)}
                {hasErrors && <span className={styles.errors}>{session.errorCount} err</span>}
              </div>
              <div className={styles.colPage}>{session.pageViews?.[0] || '/'}</div>
              <div className={styles.colStatus}>
                <span
                  className={styles.sentiment}
                  style={{ backgroundColor: style.bg, color: style.color }}
                >
                  {style.label}
                </span>
              </div>
              <div className={styles.colScore}>
                {session.summary ? `${session.summary.engagementScore}/10` : '-'}
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            ← Prev
          </button>

          <div className={styles.pageNumbers}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page: number
              if (totalPages <= 7) {
                page = i + 1
              } else if (currentPage <= 4) {
                page = i + 1
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i
              } else {
                page = currentPage - 3 + i
              }
              return (
                <button
                  key={page}
                  className={`${styles.pageNum} ${page === currentPage ? styles.active : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            })}
          </div>

          <button
            className={styles.pageBtn}
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
