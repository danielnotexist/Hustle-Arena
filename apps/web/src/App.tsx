import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Navbar from './components/layout/Navbar'

function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        setSession(session)
      } catch (err: any) {
        console.error('Auth Init Error:', err)
        setError(err.message || 'Failed to connect to Supabase')
      } finally {
        setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) setShowLogin(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <h1 className="text-red-500 text-2xl font-bold mb-2">Connection Error</h1>
        <p className="text-slate-400 text-center mb-4">{error}</p>
        <p className="text-xs text-slate-600">Check your Vercel Environment Variables</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-orange-500/30">
        {!session ? (
          <Routes>
            <Route path="/" element={showLogin ? <Login /> : <Home onAuth={() => setShowLogin(true)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <>
            <Navbar />
            <main className="pt-4">
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/wallet" element={<div className="p-8">Wallet Page coming soon</div>} />
                <Route path="/community" element={<div className="p-8">Community Forum coming soon</div>} />
                <Route path="/chat" element={<div className="p-8">Messaging System coming soon</div>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </main>
          </>
        )}
      </div>
    </Router>
  )
}

export default App
