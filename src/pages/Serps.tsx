import styles from './Serps.module.css'

export default function Serps() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>SERPs</h1>
        <span className={styles.badge}>Coming Soon</span>
      </div>
      <div className={styles.placeholder}>
        <div className={styles.icon}>🔍</div>
        <h2>Ahrefs Integration</h2>
        <p>Track your search engine rankings and SEO performance.</p>
        <p className={styles.muted}>This feature is under development.</p>
      </div>
    </div>
  )
}
