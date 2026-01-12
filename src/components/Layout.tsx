import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../App'
import styles from './Layout.module.css'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/sessions', label: 'User Sessions', icon: '👤' },
  { path: '/serps', label: 'SERPs', icon: '🔍' },
]

export default function Layout() {
  const { logout } = useAuth()

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Footage Bot</div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
              }
            >
              <span className={styles.icon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className={styles.logout}>
          Logout
        </button>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
