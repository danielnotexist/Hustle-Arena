import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Navbar from './components/layout/Navbar'

function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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
            <Route path="*" element={<Login />} />
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
