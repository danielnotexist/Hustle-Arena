import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../lib/api'
import { formatDateTime, formatUsdt } from '../lib/format'
import { useCommunityQuery, useLeaderboardQuery } from '../lib/query-hooks'
import { Button, EmptyState, ErrorState, Panel, SectionTitle, Textarea } from '../components/ui/primitives'

export default function CommunityPage() {
  const queryClient = useQueryClient()
  const communityQuery = useCommunityQuery()
  const leaderboardQuery = useLeaderboardQuery()
  const [content, setContent] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const postMutation = useMutation({
    mutationFn: () =>
      apiRequest('/community/posts', {
        method: 'POST',
        body: JSON.stringify({
          content,
        }),
      }),
    onSuccess: async () => {
      setContent('')
      setFeedback('Post published to the community feed.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community'] }),
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
      ])
    },
  })

  const friendMutation = useMutation({
    mutationFn: (friendId: string) =>
      apiRequest('/social/friends', {
        method: 'POST',
        body: JSON.stringify({
          friend_id: friendId,
        }),
      }),
    onSuccess: async () => {
      setFeedback('Friend request sent.')
      await queryClient.invalidateQueries({ queryKey: ['community'] })
    },
  })

  if (communityQuery.isLoading || leaderboardQuery.isLoading || !communityQuery.data || !leaderboardQuery.data) {
    return <Panel className="text-sm text-zinc-400">Loading community feed...</Panel>
  }

  if (communityQuery.isError || leaderboardQuery.isError) {
    return (
      <ErrorState
        title="Community feed failed to load"
        message="Posts, friends, or leaderboard data are not available right now. Check the API and refresh."
      />
    )
  }

  const { posts, friends } = communityQuery.data
  const { topEarners } = leaderboardQuery.data

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Community"
        title="Feed, profiles, and social graph"
        description="Players can post updates, build friend lists, and move into direct messaging without leaving the app shell."
      />

      {feedback ? <Panel className="border-signal-orange/20 bg-signal-orange/10 py-4 text-sm text-signal-orange">{feedback}</Panel> : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">New post</p>
            <Textarea placeholder="Share a win, queue callout, or tournament note..." value={content} onChange={(event) => setContent(event.target.value)} />
            <Button type="button" disabled={postMutation.isPending || content.trim().length < 3} onClick={() => postMutation.mutate()}>
              {postMutation.isPending ? 'Publishing...' : 'Publish post'}
            </Button>
          </Panel>

          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Arena feed</p>
            {posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <article key={post.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{post.author?.display_name ?? post.user_id}</p>
                        <p className="text-xs text-zinc-500">@{post.author?.username ?? 'arena-player'}</p>
                      </div>
                      <p className="text-xs text-zinc-500">{formatDateTime(post.created_at)}</p>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-zinc-300">{post.content}</p>
                    {post.author ? (
                      <div className="mt-4">
                        <Button type="button" variant="ghost" onClick={() => friendMutation.mutate(post.author!.id)}>
                          Add friend
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No posts yet" message="Start the feed with the first update from your squad." />
            )}
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Friends</p>
            {friends.length > 0 ? (
              <div className="space-y-3">
                {friends.map((friend) => (
                  <div key={friend.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">{friend.display_name}</p>
                    <p className="mt-1 text-xs text-zinc-500">@{friend.username}</p>
                    <p className="mt-3 text-sm text-zinc-400">ELO {friend.elo_rating}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No friends yet" message="Send requests from the feed or leaderboard to build your network." />
            )}
          </Panel>

          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Top earners</p>
            <div className="space-y-3">
              {topEarners.map((entry, index) => (
                <div key={entry.user_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        #{index + 1} {entry.username}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{formatUsdt(entry.value)} USDT lifetime</p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => friendMutation.mutate(entry.user_id)}>
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
