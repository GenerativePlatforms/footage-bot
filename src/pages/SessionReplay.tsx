import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useRef, useState } from 'react'
import styles from './SessionReplay.module.css'

type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated'

function getSentimentStyle(sentiment: Sentiment | undefined): { bg: string; color: string } {
  switch (sentiment) {
    case 'positive': return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }
    case 'neutral': return { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }
    case 'negative': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }
    case 'frustrated': return { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }
    default: return { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }
  }
}

export default function SessionReplay() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const playerRef = useRef<HTMLDivElement>(null)
  const [playerInstance, setPlayerInstance] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<any[] | null>(null)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const session = useQuery(
    api.sessions.getByPosthogId,
    sessionId ? { posthogId: sessionId } : 'skip'
  )

  const notes = useQuery(
    api.notes.getBySessionId,
    sessionId ? { sessionId } : 'skip'
  )

  const fetchSnapshots = useAction(api.posthogSync.fetchSnapshots)

  useEffect(() => {
    if (!session || !sessionId || snapshots !== null || loadingSnapshots) return

    setLoadingSnapshots(true)
    fetchSnapshots({ posthogId: sessionId })
      .then((data) => {
        if (data && data.sources) {
          const events: any[] = []
          if (data.snapshot_data_by_window_id) {
            for (const windowId in data.snapshot_data_by_window_id) {
              const windowData = data.snapshot_data_by_window_id[windowId]
              if (Array.isArray(windowData)) {
                events.push(...windowData)
              }
            }
          }
          setSnapshots(events.length > 0 ? events : [])
        } else if (Array.isArray(data)) {
          setSnapshots(data)
        } else {
          setSnapshots([])
        }
      })
      .catch((err) => {
        console.error('Failed to fetch snapshots:', err)
        setError('Failed to load session recording')
        setSnapshots([])
      })
      .finally(() => {
        setLoadingSnapshots(false)
      })
  }, [session, sessionId, snapshots, loadingSnapshots, fetchSnapshots])

  useEffect(() => {
    if (!snapshots || snapshots.length === 0 || !playerRef.current || playerInstance) return

    import('rrweb-player').then(({ default: rrwebPlayer }) => {
      playerRef.current!.innerHTML = ''

      try {
        // Debug: log event info
        console.log('Total events:', snapshots.length)
        const hasFullSnapshot = snapshots.some((e: any) => e && e.type === 2)
        console.log('Has FullSnapshot:', hasFullSnapshot)

        if (!hasFullSnapshot) {
          console.error('No FullSnapshot event found - player cannot render')
          setError('Recording data incomplete - missing full snapshot')
          return
        }

        // Filter out any malformed events (must have type and timestamp)
        const validEvents = snapshots.filter((e: any) =>
          e && typeof e.type === 'number' && typeof e.timestamp === 'number'
        )
        console.log('Valid events:', validEvents.length)

        const player = new rrwebPlayer({
          target: playerRef.current!,
          props: {
            events: validEvents,
            width: 800,
            height: 450,
            autoPlay: false,
            showController: true,
            speedOption: [1, 2, 4, 8],
          },
        })
        setPlayerInstance(player)
      } catch (err) {
        console.error('Failed to initialize player:', err)
        setError('Failed to initialize session player')
      }
    }).catch(err => {
      console.error('Failed to load rrweb-player:', err)
      setError('Failed to load replay player')
    })

    return () => {
      if (playerInstance) {
        playerInstance.pause?.()
      }
    }
  }, [snapshots, playerInstance])

  if (session === undefined) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (session === null) {
    return (
      <div className={styles.notFound}>
        <h2>Session not found</h2>
        <button onClick={() => navigate('/sessions')} className={styles.backButton}>
          Back to Sessions
        </button>
      </div>
    )
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const sentiment = session.summary?.sentiment as Sentiment | undefined
  const sentimentStyle = getSentimentStyle(sentiment)

  return (
    <div className={styles.container}>
      {/* Compact Header */}
      <div className={styles.header}>
        <button onClick={() => navigate('/sessions')} className={styles.backButton}>
          ←
        </button>
        <div className={styles.headerInfo}>
          <span className={styles.userEmail}>{session.userId || 'Anonymous'}</span>
          <span className={styles.headerMeta}>
            {formatDuration(session.duration)} · {session.pageViews?.[0] || '/'} · {new Date(session.startTime).toLocaleDateString()}
          </span>
        </div>
        {session.summary && (
          <span
            className={styles.sentimentBadge}
            style={{ backgroundColor: sentimentStyle.bg, color: sentimentStyle.color }}
          >
            {session.summary.sentiment} · {session.summary.engagementScore}/10
          </span>
        )}
      </div>

      {/* AI Analysis - Condensed */}
      {session.summary && (
        <div className={styles.analysis}>
          <div className={styles.analysisHeader}>
            <h3>AI Analysis</h3>
            {session.errorCount > 0 && (
              <span className={styles.errorBadge}>{session.errorCount} errors</span>
            )}
          </div>

          <p className={styles.overview}>{session.summary.overview}</p>

          <div className={styles.analysisGrid}>
            <div className={styles.analysisCol}>
              <h4>Pain Points</h4>
              {session.summary.painPoints?.length > 0 ? (
                <ul>
                  {session.summary.painPoints.slice(0, 3).map((point: string, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>None identified</p>
              )}
            </div>

            <div className={styles.analysisCol}>
              <h4>Recommendations</h4>
              {session.summary.recommendations?.length > 0 ? (
                <ul>
                  {session.summary.recommendations.slice(0, 3).map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>None</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes - Collapsible */}
      {notes && notes.length > 0 && (
        <div className={styles.notesSection}>
          <button
            className={styles.notesToggle}
            onClick={() => setShowNotes(!showNotes)}
          >
            <span>Notes ({notes.length})</span>
            <span>{showNotes ? '−' : '+'}</span>
          </button>

          {showNotes && (
            <div className={styles.notesList}>
              {notes.map((note) => (
                <div key={note._id} className={styles.noteCard}>
                  <div className={styles.noteTags}>
                    <span className={`${styles.noteType} ${styles[note.type]}`}>{note.type.replace('_', ' ')}</span>
                    <span className={`${styles.notePriority} ${styles[note.priority]}`}>{note.priority}</span>
                  </div>
                  <h4>{note.title}</h4>
                  <p>{note.description.slice(0, 200)}{note.description.length > 200 ? '...' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Video Player */}
      <div className={styles.playerSection}>
        <h3>Session Recording</h3>
        {loadingSnapshots ? (
          <div className={styles.playerLoading}>Loading recording...</div>
        ) : error ? (
          <div className={styles.playerError}>{error}</div>
        ) : snapshots && snapshots.length > 0 ? (
          <div className={styles.playerWrapper}>
            <div ref={playerRef} className={styles.player} />
          </div>
        ) : (
          <div className={styles.noRecording}>
            <p>No recording available</p>
          </div>
        )}
      </div>
    </div>
  )
}
