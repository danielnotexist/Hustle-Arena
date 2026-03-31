import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LoadingState } from './components/ui/primitives'
import { useAuth } from './providers/AuthProvider'
import AuthCallbackPage from './pages/AuthCallback'
import AdminPage from './pages/Admin'
import ChatPage from './pages/Chat'
import CommunityPage from './pages/Community'
import DashboardPage from './pages/Dashboard'
import LandingPage from './pages/Landing'
import LoginPage from './pages/Login'
import MatchmakingPage from './pages/Matchmaking'
import WalletPage from './pages/Wallet'

function ProtectedLayout() {
  const { session, loading } = useAuth()

  if (loading) {
    return <LoadingState label="Authenticating arena access..." />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <AppShell />
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <LoadingState label="Booting Hustle-Arena..." />
  }

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/matchmaking" element={<MatchmakingPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/'} replace />} />
    </Routes>
  )
}
