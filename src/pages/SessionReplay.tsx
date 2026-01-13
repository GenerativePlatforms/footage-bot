import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useRef, useState } from 'react'
import styles from './SessionReplay.module.css'

export default function SessionReplay() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const playerRef = useRef<HTMLDivElement>(null)
  const [playerInstance, setPlayerInstance] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<any[] | null>(null)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)

  // Query the session from the sessions table using posthogId
  const session = useQuery(
    api.sessions.getByPosthogId,
    sessionId ? { posthogId: sessionId } : 'skip'
  )

  // Query notes for this session
  const notes = useQuery(
    api.notes.getBySessionId,
    sessionId ? { sessionId } : 'skip'
  )

  // Action to fetch PostHog snapshots
  const fetchSnapshots = useAction(api.posthogSync.fetchSnapshots)

  // Fetch snapshots when session is loaded
  useEffect(() => {
    if (!session || !sessionId || snapshots !== null || loadingSnapshots) return

    setLoadingSnapshots(true)
    fetchSnapshots({ posthogId: sessionId })
      .then((data) => {
        // PostHog returns snapshots in a specific format - extract rrweb events
        if (data && data.sources) {
          // Combine all snapshot sources into rrweb events
          const events: any[] = []
          for (const source of data.sources) {
            if (source.source === 'blob' && source.blob_key) {
              // Need to fetch blob data - for now just note it
              console.log('Blob source found:', source.blob_key)
            }
          }
          // If there are snapshot_data_by_window_id, extract events
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
        setError('Failed to load session recording from PostHog')
        setSnapshots([])
      })
      .finally(() => {
        setLoadingSnapshots(false)
      })
  }, [session, sessionId, snapshots, loadingSnapshots, fetchSnapshots])

  // Initialize video player when snapshots are loaded
  useEffect(() => {
    if (!snapshots || snapshots.length === 0 || !playerRef.current || playerInstance) return

    // Dynamically import rrweb-player to avoid SSR issues
    import('rrweb-player').then(({ default: rrwebPlayer }) => {
      // Clear any existing content
      playerRef.current!.innerHTML = ''

      try {
        const player = new rrwebPlayer({
          target: playerRef.current!,
          props: {
            events: snapshots,
            width: 1024,
            height: 576,
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
    return <div className={styles.loading}>Loading session...</div>
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/sessions')} className={styles.backButton}>
          &larr; Back to Sessions
        </button>
        <h1>Session Replay</h1>
      </div>

      <div className={styles.metadata}>
        <div className={styles.metaItem}>
          <span className={styles.label}>Session ID:</span>
          <span className={styles.value}>{session.posthogId}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>User:</span>
          <span className={styles.value}>{session.userId || 'Anonymous'}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Page:</span>
          <span className={styles.value}>{session.pageViews?.[0] || 'Unknown'}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Started:</span>
          <span className={styles.value}>{new Date(session.startTime).toLocaleString()}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Duration:</span>
          <span className={styles.value}>{formatDuration(session.duration)}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Device:</span>
          <span className={styles.value}>
            {session.device.type} / {session.device.browser} / {session.device.os}
          </span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Location:</span>
          <span className={styles.value}>
            {session.location.city ? `${session.location.city}, ` : ''}{session.location.country}
          </span>
        </div>
        {session.errorCount > 0 && (
          <div className={styles.metaItem}>
            <span className={styles.label}>Errors:</span>
            <span className={styles.value} style={{ color: '#ef4444' }}>{session.errorCount}</span>
          </div>
        )}
      </div>

      {loadingSnapshots ? (
        <div className={styles.loading}>Loading session recording...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : snapshots && snapshots.length > 0 ? (
        <div className={styles.playerWrapper}>
          <div ref={playerRef} className={styles.player} />
        </div>
      ) : (
        <div className={styles.noRecording}>
          <p>No recording available for this session.</p>
          <p className={styles.hint}>The session replay may still be processing in PostHog.</p>
        </div>
      )}

      {session.summary && (
        <div className={styles.analysis}>
          <h3>AI Analysis</h3>
          <div className={styles.analysisContent}>
            <div className={styles.analysisSection}>
              <h4>Overview</h4>
              <p>{session.summary.overview}</p>
            </div>
            <div className={styles.analysisSection}>
              <h4>User Intent</h4>
              <p>{session.summary.userIntent}</p>
            </div>
            {session.summary.painPoints?.length > 0 && (
              <div className={styles.analysisSection}>
                <h4>Pain Points</h4>
                <ul>
                  {session.summary.painPoints.map((point: string, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.summary.successfulFlows?.length > 0 && (
              <div className={styles.analysisSection}>
                <h4>Successful Flows</h4>
                <ul>
                  {session.summary.successfulFlows.map((flow: string, i: number) => (
                    <li key={i}>{flow}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.summary.recommendations?.length > 0 && (
              <div className={styles.analysisSection}>
                <h4>Recommendations</h4>
                <ul>
                  {session.summary.recommendations.map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.analysisSection}>
              <h4>Metrics</h4>
              <p>Sentiment: <strong>{session.summary.sentiment}</strong></p>
              <p>Engagement Score: <strong>{session.summary.engagementScore}/10</strong></p>
            </div>
          </div>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className={styles.notes}>
          <h3>Session Notes</h3>
          <div className={styles.notesList}>
            {notes.map((note) => (
              <div key={note._id} className={`${styles.noteCard} ${styles[note.priority]}`}>
                <div className={styles.noteHeader}>
                  <span className={`${styles.noteType} ${styles[note.type]}`}>{note.type.replace('_', ' ')}</span>
                  <span className={`${styles.notePriority} ${styles[note.priority]}`}>{note.priority}</span>
                  <span className={`${styles.noteStatus} ${styles[note.status]}`}>{note.status.replace('_', ' ')}</span>
                </div>
                <h4 className={styles.noteTitle}>{note.title}</h4>
                <p className={styles.noteDescription}>{note.description}</p>
                {note.tags.length > 0 && (
                  <div className={styles.noteTags}>
                    {note.tags.map((tag, i) => (
                      <span key={i} className={styles.noteTag}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
