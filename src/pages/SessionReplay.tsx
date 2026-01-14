import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useRef, useState } from 'react'
import { decompressSync } from 'fflate'
import styles from './SessionReplay.module.css'

// Decompress event data if it's a compressed string
function decompressEventData(event: any): any {
  if (!event || typeof event !== 'object') return event

  // If data is a compressed string (gzip starts with char code 31)
  if (typeof event.data === 'string' && event.data.charCodeAt(0) === 31) {
    try {
      // Convert string to Uint8Array
      const compressed = new Uint8Array(event.data.length)
      for (let i = 0; i < event.data.length; i++) {
        compressed[i] = event.data.charCodeAt(i)
      }
      // Decompress
      const decompressed = decompressSync(compressed)
      // Convert back to string and parse JSON
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(decompressed)
      const parsedData = JSON.parse(jsonStr)
      return { ...event, data: parsedData }
    } catch (err) {
      console.error('Failed to decompress event data:', err)
      return event
    }
  }
  return event
}

// Recursively clean a DOM node tree to remove undefined/malformed nodes
function cleanNode(node: any): any {
  // Skip undefined/null nodes
  if (node === undefined || node === null) return null
  if (typeof node !== 'object') return null

  // Ensure node has required type and id properties for rrweb
  if (typeof node.type !== 'number') return null
  if (typeof node.id !== 'number') return null

  const cleaned: any = { ...node }

  // Clean childNodes array if present - filter out undefined/null BEFORE mapping
  if (Array.isArray(node.childNodes)) {
    cleaned.childNodes = node.childNodes
      .filter((child: any) => child !== undefined && child !== null)
      .map((child: any) => cleanNode(child))
      .filter((child: any) => child !== null)
  }

  // Clean children array if present (some formats use this)
  if (Array.isArray(node.children)) {
    cleaned.children = node.children
      .filter((child: any) => child !== undefined && child !== null)
      .map((child: any) => cleanNode(child))
      .filter((child: any) => child !== null)
  }

  return cleaned
}

// Sanitize rrweb events to fix malformed data
function sanitizeEvents(events: any[]): any[] {
  return events.map((event) => {
    if (!event || typeof event !== 'object') return null
    if (typeof event.type !== 'number' || typeof event.timestamp !== 'number') return null

    // First, decompress the event data if needed
    const decompressedEvent = decompressEventData(event)

    // For FullSnapshot events (type 2), clean the node tree
    if (decompressedEvent.type === 2 && decompressedEvent.data && decompressedEvent.data.node) {
      const cleanedNode = cleanNode(decompressedEvent.data.node)
      if (!cleanedNode) return null
      return {
        ...decompressedEvent,
        data: {
          ...decompressedEvent.data,
          node: cleanedNode,
        },
      }
    }

    // For IncrementalSnapshot events (type 3), clean mutation data if present
    if (decompressedEvent.type === 3 && decompressedEvent.data) {
      const cleanedData = { ...decompressedEvent.data }

      // Clean adds array (new nodes added to DOM)
      if (Array.isArray(cleanedData.adds)) {
        cleanedData.adds = cleanedData.adds
          .filter((add: any) => add && add.node)
          .map((add: any) => ({
            ...add,
            node: cleanNode(add.node) || add.node,
          }))
          .filter((add: any) => add.node)
      }

      return { ...decompressedEvent, data: cleanedData }
    }

    return decompressedEvent
  }).filter((event: any) => event !== null)
}

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
        // Check for required FullSnapshot event
        const hasFullSnapshot = snapshots.some((e: any) => e && e.type === 2)
        if (!hasFullSnapshot) {
          setError('Recording data incomplete - missing full snapshot')
          return
        }

        // Sanitize events: decompress and clean malformed DOM nodes
        const validEvents = sanitizeEvents(snapshots)
        if (validEvents.length === 0) {
          setError('No valid events in recording')
          return
        }

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
