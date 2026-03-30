import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Trophy, Wallet, User as UserIcon, Play } from 'lucide-react'

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null)
  const [wallet, setWallet] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Fetch Profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(profileData)

        // Fetch Wallet
        const { data: walletData } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .single()
        setWallet(walletData)

        // Fetch Matches
        const { data: matchesData } = await supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)
        setMatches(matchesData || [])
      }
    }
    loadData()
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-orange-500/10 rounded-xl">
            <Trophy className="text-orange-500 h-8 w-8" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">ELO Rating</p>
            <p className="text-2xl font-bold">{profile?.elo_rating || '1000'}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Wallet className="text-blue-500 h-8 w-8" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">USDT Balance</p>
            <p className="text-2xl font-bold">${wallet?.balance || '0.00'}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center space-x-4">
          <div className="p-3 bg-red-500/10 rounded-xl">
            <UserIcon className="text-red-500 h-8 w-8" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">KYC Status</p>
            <p className="text-lg font-semibold uppercase">{profile?.kyc_status || 'NOT STARTED'}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Matches */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Active Matches</h2>
            <button className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg font-semibold flex items-center space-x-2 transition">
              <Play className="h-4 w-4" />
              <span>Find Match</span>
            </button>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {matches.length > 0 ? (
              <div className="divide-y divide-slate-800">
                {matches.map((match) => (
                  <div key={match.id} className="p-4 hover:bg-slate-800/50 transition flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{match.game_type} - ${match.wager_amount}</p>
                      <p className="text-xs text-slate-500">Status: {match.status}</p>
                    </div>
                    <button className="border border-slate-700 px-3 py-1 rounded hover:bg-slate-800">View</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <p>No active matches found. Start your own!</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar News/Leaderboard */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Community Feed</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-500 text-sm">Welcome to Hustle Arena. Check back for tournament news!</p>
          </div>
        </div>
      </div>
    </div>
  )
}
