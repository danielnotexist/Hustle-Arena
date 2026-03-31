import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Shield, Wallet } from 'lucide-react'
import type { AdminKycQueueItem, AdminWithdrawalQueueItem, KycSubmission, Profile, WithdrawalRequest } from '@hustle-arena/shared-types'
import { ApiError, apiRequest } from '../lib/api'
import { formatDateTime, formatUsdt, kycLabel, shortId } from '../lib/format'
import { useAdminQuery, useBootstrapQuery } from '../lib/query-hooks'
import { Button, EmptyState, ErrorState, Input, LoadingState, MetricCard, Panel, SectionTitle, StatusBadge, Textarea } from '../components/ui/primitives'

type KycReviewDraft = {
  reason: string
  notes: string
}

type WithdrawalReviewDraft = {
  reason: string
  txHash: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'The request failed.'
}

function kycTone(status: KycSubmission['status']) {
  if (status === 'verified') {
    return 'success'
  }

  if (status === 'rejected') {
    return 'danger'
  }

  return 'warning'
}

function withdrawalTone(status: WithdrawalRequest['status']) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'rejected') {
    return 'danger'
  }

  if (status === 'processing') {
    return 'brand'
  }

  return 'warning'
}

function UserStateRow({ profile }: { profile: Profile }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge tone={kycTone(profile.kyc_status)}>{kycLabel(profile.kyc_status)}</StatusBadge>
      <StatusBadge tone={profile.is_vip ? 'success' : 'neutral'}>{profile.is_vip ? 'VIP' : 'Standard'}</StatusBadge>
      {profile.is_admin ? <StatusBadge tone="warning">Admin</StatusBadge> : null}
    </div>
  )
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const bootstrapQuery = useBootstrapQuery()
  const viewer = bootstrapQuery.data?.viewer ?? null
  const adminQuery = useAdminQuery(Boolean(viewer?.is_admin))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [kycDrafts, setKycDrafts] = useState<Record<string, KycReviewDraft>>({})
  const [withdrawalDrafts, setWithdrawalDrafts] = useState<Record<string, WithdrawalReviewDraft>>({})

  const invalidateAdminSurface = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
      queryClient.invalidateQueries({ queryKey: ['wallet'] }),
      queryClient.invalidateQueries({ queryKey: ['kyc'] }),
    ])
  }

  const roleMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      apiRequest<Profile>(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_admin: isAdmin }),
      }),
    onSuccess: async (_, variables) => {
      setFeedback(variables.isAdmin ? 'Admin role granted.' : 'Admin role revoked.')
      await invalidateAdminSurface()
    },
    onError: (error) => {
      setFeedback(getErrorMessage(error))
    },
  })

  const kycMutation = useMutation({
    mutationFn: ({
      submissionId,
      status,
      reason,
      notes,
    }: {
      submissionId: string
      status: 'verified' | 'rejected'
      reason?: string
      notes?: string
    }) =>
      apiRequest<KycSubmission>(`/admin/kyc/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reason,
          notes,
        }),
      }),
    onSuccess: async (_, variables) => {
      setFeedback(variables.status === 'verified' ? 'KYC approved.' : 'KYC rejected.')
      await invalidateAdminSurface()
    },
    onError: (error) => {
      setFeedback(getErrorMessage(error))
    },
  })

  const withdrawalMutation = useMutation({
    mutationFn: ({
      requestId,
      decision,
      reason,
      txHash,
    }: {
      requestId: string
      decision: 'approve' | 'reject'
      reason?: string
      txHash?: string
    }) =>
      apiRequest<WithdrawalRequest>(`/admin/withdrawals/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          reason,
          tx_hash: txHash,
        }),
      }),
    onSuccess: async (_, variables) => {
      setFeedback(variables.decision === 'approve' ? 'Withdrawal completed.' : 'Withdrawal rejected and refunded.')
      await invalidateAdminSurface()
    },
    onError: (error) => {
      setFeedback(getErrorMessage(error))
    },
  })

  const updateKycDraft = (submissionId: string, patch: Partial<KycReviewDraft>) => {
    setKycDrafts((current) => ({
      ...current,
      [submissionId]: {
        reason: current[submissionId]?.reason ?? '',
        notes: current[submissionId]?.notes ?? '',
        ...patch,
      },
    }))
  }

  const updateWithdrawalDraft = (requestId: string, patch: Partial<WithdrawalReviewDraft>) => {
    setWithdrawalDrafts((current) => ({
      ...current,
      [requestId]: {
        reason: current[requestId]?.reason ?? '',
        txHash: current[requestId]?.txHash ?? '',
        ...patch,
      },
    }))
  }

  const activeAlerts = useMemo(() => adminQuery.data?.riskEvents.filter((event) => event.severity !== 'low') ?? [], [adminQuery.data?.riskEvents])

  if (bootstrapQuery.isLoading || (viewer?.is_admin && adminQuery.isLoading)) {
    return <LoadingState label="Loading admin operations..." />
  }

  if (bootstrapQuery.isError || !viewer) {
    return <ErrorState title="Admin shell failed to load" message="Your session could not be restored. Refresh the app and sign in again." />
  }

  if (!viewer.is_admin) {
    return (
      <ErrorState
        title="Admin access required"
        message="This route is reserved for admin operators. Promote the profile in Supabase or through the bootstrap script before opening the control surface."
      />
    )
  }

  if (adminQuery.isError || !adminQuery.data) {
    return (
      <ErrorState
        title="Admin data could not load"
        message="The admin API did not return a snapshot. Check that the server is deployed with Supabase service credentials, then refresh."
        action={
          <Button type="button" onClick={() => void adminQuery.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const { summary, users, pendingKyc, pendingWithdrawals, riskEvents } = adminQuery.data

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Admin Control"
        title="Review gated activity, wallet exits, and operator access."
        description="This surface is for the operational side of Hustle-Arena: clear KYC, approve or reject withdrawals, and decide which profiles can access backoffice tools."
        actions={
          <StatusBadge tone={activeAlerts.length > 0 ? 'warning' : 'success'}>
            {activeAlerts.length > 0 ? `${activeAlerts.length} elevated alerts` : 'Risk feed quiet'}
          </StatusBadge>
        }
      />

      {feedback ? (
        <Panel className="flex items-center justify-between gap-4 border-white/15 bg-white/[0.03]">
          <p className="text-sm text-zinc-200">{feedback}</p>
          <Button type="button" variant="ghost" onClick={() => setFeedback(null)}>
            Dismiss
          </Button>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Users" value={String(summary.totalUsers)} detail={`${summary.adminUsers} operators have admin access.`} accent="bg-signal-cyan" />
        <MetricCard label="Pending KYC" value={String(summary.pendingKyc)} detail={`${summary.verifiedKyc} profiles are already verified.`} accent="bg-amber-400" />
        <MetricCard
          label="Pending Withdrawals"
          value={String(summary.pendingWithdrawals)}
          detail="Review these before custodial funds leave the platform."
          accent="bg-signal-orange"
        />
        <MetricCard label="Active Matches" value={String(summary.activeMatches)} detail="Any match outside completed or cancelled status." accent="bg-emerald-400" />
        <MetricCard label="Available USDT" value={`${formatUsdt(summary.totalAvailableBalance)}`} detail="Aggregate off-chain wallet balance." accent="bg-sky-400" />
        <MetricCard label="Locked USDT" value={`${formatUsdt(summary.totalLockedBalance)}`} detail="Capital currently locked in stakes or requests." accent="bg-rose-400" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="space-y-5">
          <SectionTitle
            eyebrow="User Access"
            title="Profiles and role control"
            description="Grant or revoke admin access directly from the latest player roster. The current admin account cannot demote itself."
          />

          <div className="space-y-3">
            {users.map(({ profile, wallet }) => (
              <div key={profile.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{profile.display_name}</h3>
                        <StatusBadge tone="neutral">ELO {profile.elo_rating}</StatusBadge>
                      </div>
                      <p className="mt-1 text-sm text-zinc-400">
                        @{profile.username} · {profile.country_code ?? 'Global'} · Joined {formatDateTime(profile.created_at)}
                      </p>
                    </div>
                    <UserStateRow profile={profile} />
                    <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                      <p>
                        Available: <span className="text-white">{formatUsdt(wallet?.balance ?? 0)} USDT</span>
                      </p>
                      <p>
                        Locked: <span className="text-white">{formatUsdt(wallet?.locked_balance ?? 0)} USDT</span>
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant={profile.is_admin ? 'ghost' : 'secondary'}
                    disabled={roleMutation.isPending || (profile.id === viewer.id && profile.is_admin)}
                    onClick={() => roleMutation.mutate({ userId: profile.id, isAdmin: !profile.is_admin })}
                  >
                    <Shield className="h-4 w-4" />
                    {profile.is_admin ? 'Revoke admin' : 'Grant admin'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-5">
          <SectionTitle
            eyebrow="Risk Feed"
            title="Latest anti-cheat and ops hooks"
            description="These entries are future-ready review signals for fraud, anti-cheat, and operational decisions."
          />

          {riskEvents.length === 0 ? (
            <EmptyState title="No risk events yet" message="Admin decisions and future fraud signals will accumulate here once the platform starts moving." />
          ) : (
            <div className="space-y-3">
              {riskEvents.map((event) => (
                <div key={event.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={event.severity === 'high' ? 'danger' : event.severity === 'medium' ? 'warning' : 'neutral'}>
                          {event.severity}
                        </StatusBadge>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">{event.event_type.replace(/_/g, ' ')}</p>
                      </div>
                      <p className="text-sm text-zinc-300">
                        User {event.user_id ? shortId(event.user_id) : 'n/a'} · Match {event.match_id ? shortId(event.match_id) : 'n/a'}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{formatDateTime(event.created_at)}</p>
                  </div>
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="space-y-5">
          <SectionTitle
            eyebrow="KYC Queue"
            title="Pending verification reviews"
            description="Review identity packages before users can deposit, withdraw, or enter paid matches."
          />

          {pendingKyc.length === 0 ? (
            <EmptyState title="KYC queue is clear" message="There are no pending identity reviews at the moment." />
          ) : (
            <div className="space-y-4">
              {pendingKyc.map((item: AdminKycQueueItem) => {
                const draft = kycDrafts[item.submission.id] ?? { reason: '', notes: '' }

                return (
                  <div key={item.submission.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.profile.display_name}</h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          @{item.profile.username} · {item.submission.document_type} · Submitted {formatDateTime(item.submission.created_at)}
                        </p>
                      </div>
                      <StatusBadge tone={kycTone(item.submission.status)}>{kycLabel(item.submission.status)}</StatusBadge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                      <p>
                        Legal name: <span className="text-white">{item.submission.legal_name}</span>
                      </p>
                      <p>
                        Country: <span className="text-white">{item.submission.country_code}</span>
                      </p>
                      <p>
                        Document: <span className="text-white">{item.submission.document_number}</span>
                      </p>
                      <p>
                        Date of birth: <span className="text-white">{item.submission.date_of_birth}</span>
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <Input
                        aria-label={`Rejection reason for ${item.profile.display_name}`}
                        placeholder="Rejection reason if the package fails review"
                        value={draft.reason}
                        onChange={(event) => updateKycDraft(item.submission.id, { reason: event.target.value })}
                      />
                      <Textarea
                        aria-label={`Review notes for ${item.profile.display_name}`}
                        placeholder="Optional operator notes saved with the review"
                        value={draft.notes}
                        onChange={(event) => updateKycDraft(item.submission.id, { notes: event.target.value })}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        disabled={kycMutation.isPending}
                        onClick={() =>
                          kycMutation.mutate({
                            submissionId: item.submission.id,
                            status: 'verified',
                            notes: draft.notes.trim() || undefined,
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve KYC
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={kycMutation.isPending || !draft.reason.trim()}
                        onClick={() =>
                          kycMutation.mutate({
                            submissionId: item.submission.id,
                            status: 'rejected',
                            reason: draft.reason.trim(),
                            notes: draft.notes.trim() || undefined,
                          })
                        }
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Reject KYC
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel className="space-y-5">
          <SectionTitle
            eyebrow="Withdrawal Queue"
            title="Custodial exit review"
            description="Approve completed transfers with a transaction hash or reject and auto-refund the user balance."
          />

          {pendingWithdrawals.length === 0 ? (
            <EmptyState title="No pending withdrawals" message="Withdrawal requests will appear here once users begin cashing out." />
          ) : (
            <div className="space-y-4">
              {pendingWithdrawals.map((item: AdminWithdrawalQueueItem) => {
                const draft = withdrawalDrafts[item.request.id] ?? { reason: '', txHash: '' }

                return (
                  <div key={item.request.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.profile.display_name}</h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          @{item.profile.username} · {item.request.network} · Requested {formatDateTime(item.request.created_at)}
                        </p>
                      </div>
                      <StatusBadge tone={withdrawalTone(item.request.status)}>{item.request.status}</StatusBadge>
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-zinc-300">
                      <p>
                        Amount: <span className="text-white">{formatUsdt(item.request.amount)} USDT</span>
                      </p>
                      <p>
                        Address: <span className="break-all text-white">{item.request.wallet_address}</span>
                      </p>
                      {item.request.transaction_id ? (
                        <p>
                          Reference: <span className="text-white">{shortId(item.request.transaction_id)}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3">
                      <Input
                        aria-label={`Transfer hash for ${item.profile.display_name}`}
                        placeholder="Network transfer hash for completed withdrawals"
                        value={draft.txHash}
                        onChange={(event) => updateWithdrawalDraft(item.request.id, { txHash: event.target.value })}
                      />
                      <Textarea
                        aria-label={`Withdrawal rejection reason for ${item.profile.display_name}`}
                        placeholder="Reason if you reject and refund this withdrawal"
                        value={draft.reason}
                        onChange={(event) => updateWithdrawalDraft(item.request.id, { reason: event.target.value })}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        disabled={withdrawalMutation.isPending}
                        onClick={() =>
                          withdrawalMutation.mutate({
                            requestId: item.request.id,
                            decision: 'approve',
                            txHash: draft.txHash.trim() || undefined,
                          })
                        }
                      >
                        <Wallet className="h-4 w-4" />
                        Approve withdrawal
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={withdrawalMutation.isPending || !draft.reason.trim()}
                        onClick={() =>
                          withdrawalMutation.mutate({
                            requestId: item.request.id,
                            decision: 'reject',
                            reason: draft.reason.trim(),
                          })
                        }
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Reject and refund
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
