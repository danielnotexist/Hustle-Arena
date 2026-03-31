import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { getApiBaseUrl } from '../lib/api'
import { useAuth } from './AuthProvider'

const SocketContext = createContext<Socket | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!session?.access_token) {
      setSocket(null)
      return
    }

    const nextSocket = io(getApiBaseUrl() || window.location.origin, {
      auth: {
        token: session.access_token,
      },
      transports: ['websocket'],
    })

    nextSocket.on('wallet:update', (payload) => {
      queryClient.setQueryData(['wallet'], payload)
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    })

    nextSocket.on('match:update', () => {
      void queryClient.invalidateQueries({ queryKey: ['matchmaking'] })
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    })

    nextSocket.on('community:post-created', () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    })

    nextSocket.on('chat:message', () => {
      void queryClient.invalidateQueries({ queryKey: ['chat'] })
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    })

    nextSocket.on('friends:request', () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      void queryClient.invalidateQueries({ queryKey: ['chat'] })
    })

    nextSocket.on('friends:accepted', () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      void queryClient.invalidateQueries({ queryKey: ['chat'] })
    })

    setSocket(nextSocket)

    return () => {
      nextSocket.disconnect()
    }
  }, [queryClient, session?.access_token])

  const value = useMemo(() => socket, [socket])

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  return useContext(SocketContext)
}
