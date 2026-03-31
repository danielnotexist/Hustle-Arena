import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { useChatQuery } from '../lib/query-hooks'
import { Button, EmptyState, ErrorState, Panel, SectionTitle, Select, Textarea } from '../components/ui/primitives'

export default function ChatPage() {
  const queryClient = useQueryClient()
  const chatQuery = useChatQuery()
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [draft, setDraft] = useState('')

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest('/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: selectedFriendId,
          content: draft,
        }),
      }),
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat'] }),
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
      ])
    },
  })

  useEffect(() => {
    if (!selectedFriendId && chatQuery.data?.friends[0]) {
      setSelectedFriendId(chatQuery.data.friends[0].id)
    }
  }, [chatQuery.data?.friends, selectedFriendId])

  const threadMessages = useMemo(() => {
    if (!chatQuery.data || !selectedFriendId) {
      return []
    }

    return [...chatQuery.data.inbox]
      .filter((message) => message.sender_id === selectedFriendId || message.receiver_id === selectedFriendId)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
  }, [chatQuery.data, selectedFriendId])

  if (chatQuery.isLoading || !chatQuery.data) {
    return <Panel className="text-sm text-zinc-400">Loading chat threads...</Panel>
  }

  if (chatQuery.isError) {
    return (
      <ErrorState
        title="Chat threads failed to load"
        message="Messaging data is not available right now. Check the authenticated API routes and refresh."
      />
    )
  }

  const options = chatQuery.data.friends

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Chat"
        title="Direct messaging"
        description="Friend-based DMs stay inside the authenticated shell so players can coordinate outside of lobby chat."
      />

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Conversation target</p>
          {options.length > 0 ? (
            <>
              <Select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)}>
                {options.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.display_name} (@{friend.username})
                  </option>
                ))}
              </Select>

              <div className="space-y-3">
                {options.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedFriendId === friend.id ? 'border-signal-cyan bg-signal-cyan/10 text-white' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25'
                    }`}
                    onClick={() => setSelectedFriendId(friend.id)}
                  >
                    <p className="text-sm font-semibold">{friend.display_name}</p>
                    <p className="mt-1 text-xs text-zinc-500">@{friend.username}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No DM targets" message="Accept or send friend requests in Community before opening direct threads." />
          )}
        </Panel>

        <Panel className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Conversation thread</p>
          {selectedFriendId ? (
            <>
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
                {threadMessages.length > 0 ? (
                  threadMessages.map((message) => {
                    const isOutgoing = message.receiver_id === selectedFriendId

                    return (
                      <div
                        key={message.id}
                        className={`max-w-[80%] rounded-[24px] px-4 py-3 text-sm ${
                          isOutgoing ? 'ml-auto bg-signal-orange/90 text-ink-950' : 'bg-white/[0.05] text-zinc-200'
                        }`}
                      >
                        <p>{message.content}</p>
                        <p className={`mt-2 text-[11px] ${isOutgoing ? 'text-ink-950/70' : 'text-zinc-500'}`}>{formatDateTime(message.created_at)}</p>
                      </div>
                    )
                  })
                ) : (
                  <EmptyState title="No messages yet" message="Send the first DM to open the thread." />
                )}
              </div>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendMutation.mutate()
                }}
              >
                <Textarea placeholder="Write a direct message..." value={draft} onChange={(event) => setDraft(event.target.value)} />
                <Button type="submit" disabled={sendMutation.isPending || draft.trim().length < 1}>
                  {sendMutation.isPending ? 'Sending...' : 'Send message'}
                </Button>
              </form>
            </>
          ) : (
            <EmptyState title="Select a conversation" message="Choose a friend from the left to open a DM thread." />
          )}
        </Panel>
      </div>
    </div>
  )
}
