import { useState } from 'react'
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
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.brand}>
          {!collapsed && <span>footage.bot</span>}
        </div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.navItem} ${styles.active}` : styles.navItem
              }
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.icon}>{item.icon}</span>
              {!collapsed && <span className={styles.label}>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className={styles.logout} title={collapsed ? 'Logout' : undefined}>
          {collapsed ? '⏻' : 'Logout'}
        </button>
      </aside>
      <button
        className={`${styles.collapseBtn} ${collapsed ? styles.collapsedBtn : ''}`}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      <main className={`${styles.main} ${collapsed ? styles.mainExpanded : ''}`}>
        <Outlet />
      </main>
    </div>
  )
}
