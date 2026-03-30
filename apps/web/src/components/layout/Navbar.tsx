import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LogOut, Home, Wallet, Users, MessageSquare } from 'lucide-react'

export default function Navbar() {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="text-xl font-black text-orange-500 tracking-tighter hover:text-orange-400 transition">
          HUSTLE ARENA
        </Link>
        
        <div className="hidden md:flex items-center space-x-8 text-slate-400 font-medium text-sm">
          <Link to="/dashboard" className="flex items-center space-x-2 hover:text-white transition">
            <Home className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
          <Link to="/wallet" className="flex items-center space-x-2 hover:text-white transition">
            <Wallet className="h-4 w-4" />
            <span>Wallet</span>
          </Link>
          <Link to="/community" className="flex items-center space-x-2 hover:text-white transition">
            <Users className="h-4 w-4" />
            <span>Community</span>
          </Link>
          <Link to="/chat" className="flex items-center space-x-2 hover:text-white transition">
            <MessageSquare className="h-4 w-4" />
            <span>Messages</span>
          </Link>
        </div>

        <button 
          onClick={handleSignOut}
          className="text-slate-400 hover:text-red-500 transition p-2 rounded-full hover:bg-red-500/10"
          title="Sign Out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </nav>
  )
}
