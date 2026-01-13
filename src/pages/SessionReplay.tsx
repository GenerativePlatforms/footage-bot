import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useEffect, useRef, useState } from 'react'
import styles from './SessionReplay.module.css'

export default function SessionReplay() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const playerRef = useRef<HTMLDivElement>(null)
  const [playerInstance, setPlayerInstance] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const recording = useQuery(
    api.recordings.getBySessionId,
    sessionId ? { sessionId } : 'skip'
  )

  useEffect(() => {
    if (!recording || !playerRef.current || playerInstance) return
    if (!recording.events || recording.events.length === 0) {
      setError('No events recorded for this session')
      return
    }

    // Dynamically import rrweb-player to avoid SSR issues
    import('rrweb-player').then(({ default: rrwebPlayer }) => {
      // Clear any existing content
      playerRef.current!.innerHTML = ''

      try {
        const player = new rrwebPlayer({
          target: playerRef.current!,
          props: {
            events: recording.events,
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
  }, [recording, playerInstance])

  if (recording === undefined) {
    return <div className={styles.loading}>Loading session...</div>
  }

  if (recording === null) {
    return (
      <div className={styles.notFound}>
        <h2>Session not found</h2>
        <button onClick={() => navigate('/sessions')} className={styles.backButton}>
          Back to Sessions
        </button>
      </div>
    )
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
          <span className={styles.value}>{recording.sessionId}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Page:</span>
          <span className={styles.value}>{recording.pageUrl}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Started:</span>
          <span className={styles.value}>{new Date(recording.startTime).toLocaleString()}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.label}>Events:</span>
          <span className={styles.value}>{recording.events?.length || 0}</span>
        </div>
        {recording.metadata && (
          <>
            <div className={styles.metaItem}>
              <span className={styles.label}>Device:</span>
              <span className={styles.value}>
                {recording.metadata.deviceType} / {recording.metadata.browser} / {recording.metadata.os}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.label}>Screen:</span>
              <span className={styles.value}>
                {recording.metadata.screenWidth}x{recording.metadata.screenHeight}
              </span>
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <div className={styles.playerWrapper}>
          <div ref={playerRef} className={styles.player} />
        </div>
      )}

      {recording.analysis && (
        <div className={styles.analysis}>
          <h3>AI Analysis</h3>
          <div className={styles.analysisContent}>
            <div className={styles.analysisSection}>
              <h4>Overview</h4>
              <p>{recording.analysis.overview}</p>
            </div>
            <div className={styles.analysisSection}>
              <h4>User Intent</h4>
              <p>{recording.analysis.userIntent}</p>
            </div>
            {recording.analysis.painPoints?.length > 0 && (
              <div className={styles.analysisSection}>
                <h4>Pain Points</h4>
                <ul>
                  {recording.analysis.painPoints.map((point: string, i: number) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {recording.analysis.recommendations?.length > 0 && (
              <div className={styles.analysisSection}>
                <h4>Recommendations</h4>
                <ul>
                  {recording.analysis.recommendations.map((rec: string, i: number) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
