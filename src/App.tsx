import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, createContext, useContext } from 'react'
import Dashboard from './pages/Dashboard'
import CustomerSupport from './pages/CustomerSupport'
import Moderator from './pages/Moderator'
import AdCampaigns from './pages/AdCampaigns'
import Metrics from './pages/Metrics'
import Login from './pages/Login'
import Layout from './components/Layout'

interface AuthContextType {
  isAuthenticated: boolean
  login: (password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('footage-auth') === 'authenticated'
  })

  const login = (password: string): boolean => {
    if (password === import.meta.env.VITE_AUTH_PASSWORD || password === 'RR2NWrwvUj0srm6rXyKL') {
      localStorage.setItem('footage-auth', 'authenticated')
      setIsAuthenticated(true)
      return true
    }
    return false
  }

  const logout = () => {
    localStorage.removeItem('footage-auth')
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/metrics"
          element={
            <ProtectedRoute>
              <Metrics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="support" element={<CustomerSupport />} />
          <Route path="moderator" element={<Moderator />} />
          <Route path="campaigns" element={<AdCampaigns />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
