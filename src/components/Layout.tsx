import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../App'
import styles from './Layout.module.css'

export default function Layout() {
  const { logout } = useAuth()

  return (
    <div className={styles.layout}>
      <nav className={styles.nav}>
        <div className={styles.brand}>Footage Bot</div>
        <div className={styles.links}>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.active}` : styles.link
            }
          >
            Recordings
          </NavLink>
          <NavLink
            to="/metrics"
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.active}` : styles.link
            }
          >
            Metrics
          </NavLink>
        </div>
        <button onClick={logout} className={styles.logout}>
          Logout
        </button>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
