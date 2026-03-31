import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SupportedNetwork, VipPlan } from '@hustle-arena/shared-types'
import { apiRequest } from '../lib/api'
import { formatDateTime, formatUsdt, kycLabel, transactionLabel } from '../lib/format'
import { useKycQuery, useWalletQuery } from '../lib/query-hooks'
import { Button, EmptyState, ErrorState, Input, Panel, SectionTitle, Select, StatusBadge, Textarea } from '../components/ui/primitives'

function nextIdempotencyKey() {
  return `${Date.now()}-${window.crypto.randomUUID()}`
}

export default function WalletPage() {
  const queryClient = useQueryClient()
  const walletQuery = useWalletQuery()
  const kycQuery = useKycQuery()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [depositForm, setDepositForm] = useState({ amount: 25, network: 'TRC20' as SupportedNetwork, tx_hash: '' })
  const [withdrawForm, setWithdrawForm] = useState({ amount: 25, network: 'TRC20' as SupportedNetwork, wallet_address: '' })
  const [kycForm, setKycForm] = useState({
    legal_name: '',
    date_of_birth: '',
    country_code: 'US',
    document_type: 'passport',
    document_number: '',
  })

  const invalidateWallet = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet'] }),
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] }),
      queryClient.invalidateQueries({ queryKey: ['kyc'] }),
    ])
  }

  const depositMutation = useMutation({
    mutationFn: () =>
      apiRequest('/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          ...depositForm,
          idempotency_key: nextIdempotencyKey(),
        }),
      }),
    onSuccess: async () => {
      setFeedback('Deposit credited successfully.')
      await invalidateWallet()
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: () =>
      apiRequest('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          ...withdrawForm,
          idempotency_key: nextIdempotencyKey(),
        }),
      }),
    onSuccess: async () => {
      setFeedback('Withdrawal request submitted.')
      await invalidateWallet()
      setWithdrawForm((current) => ({ ...current, wallet_address: '' }))
    },
  })

  const kycMutation = useMutation({
    mutationFn: () =>
      apiRequest('/kyc', {
        method: 'POST',
        body: JSON.stringify(kycForm),
      }),
    onSuccess: async () => {
      setFeedback('KYC submission received.')
      await invalidateWallet()
    },
  })

  const vipMutation = useMutation({
    mutationFn: (plan: VipPlan) =>
      apiRequest('/wallet/vip', {
        method: 'POST',
        body: JSON.stringify({
          plan_type: plan,
          idempotency_key: nextIdempotencyKey(),
        }),
      }),
    onSuccess: async () => {
      setFeedback('VIP subscription activated.')
      await invalidateWallet()
    },
  })

  if (walletQuery.isLoading || kycQuery.isLoading || !walletQuery.data) {
    return <Panel className="text-sm text-zinc-400">Loading wallet systems...</Panel>
  }

  if (walletQuery.isError || kycQuery.isError) {
    return (
      <ErrorState
        title="Wallet systems failed to load"
        message="The wallet route depends on authenticated API access and Supabase RPC functions. Check both if this persists."
      />
    )
  }

  const { wallet, transactions, withdrawals, auditLogs, deposit_addresses } = walletQuery.data
  const kycSubmission = kycQuery.data
  const isKycVerified = kycSubmission?.status === 'verified'

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Wallet"
        title="Custodial balance controls"
        description="Deposit credit, withdrawal requests, VIP billing, and audit state all flow through server-side balance operations."
      />

      {feedback ? (
        <Panel className="border-emerald-500/20 bg-emerald-500/10 py-4 text-sm text-emerald-200">{feedback}</Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Identity gate</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">KYC status: {kycLabel(kycSubmission?.status ?? 'pending')}</h3>
            </div>
            <StatusBadge tone={isKycVerified ? 'success' : 'warning'}>{isKycVerified ? 'Verified' : 'Required'}</StatusBadge>
          </div>
          <p className="text-sm text-zinc-400">
            Protected actions stay blocked until this status is verified. For MVP flow, the backend can auto-approve based on environment configuration.
          </p>
          {!isKycVerified ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                kycMutation.mutate()
              }}
            >
              <Input placeholder="Legal name" value={kycForm.legal_name} onChange={(event) => setKycForm((current) => ({ ...current, legal_name: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="date" value={kycForm.date_of_birth} onChange={(event) => setKycForm((current) => ({ ...current, date_of_birth: event.target.value }))} />
                <Input placeholder="Country code" value={kycForm.country_code} onChange={(event) => setKycForm((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Document type" value={kycForm.document_type} onChange={(event) => setKycForm((current) => ({ ...current, document_type: event.target.value }))} />
                <Input placeholder="Document number" value={kycForm.document_number} onChange={(event) => setKycForm((current) => ({ ...current, document_number: event.target.value }))} />
              </div>
              <Button type="submit" disabled={kycMutation.isPending}>
                {kycMutation.isPending ? 'Submitting KYC...' : 'Submit KYC package'}
              </Button>
            </form>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              Identity checks are verified. Deposits, withdrawals, and queue entry are unlocked.
            </div>
          )}
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Deposit credit</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{formatUsdt(wallet.balance)} USDT</h3>
              </div>
              <StatusBadge tone="brand">Available</StatusBadge>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
              <p>TRC20: {deposit_addresses.TRC20}</p>
              <p className="mt-2">BEP20: {deposit_addresses.BEP20}</p>
            </div>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                depositMutation.mutate()
              }}
            >
              <Input
                type="number"
                min={1}
                step="0.01"
                value={depositForm.amount}
                onChange={(event) => setDepositForm((current) => ({ ...current, amount: Number(event.target.value) }))}
              />
              <Select value={depositForm.network} onChange={(event) => setDepositForm((current) => ({ ...current, network: event.target.value as SupportedNetwork }))}>
                <option value="TRC20">TRC20</option>
                <option value="BEP20">BEP20</option>
              </Select>
              <Input placeholder="Transaction hash (optional)" value={depositForm.tx_hash} onChange={(event) => setDepositForm((current) => ({ ...current, tx_hash: event.target.value }))} />
              <Button type="submit" disabled={!isKycVerified || depositMutation.isPending}>
                {depositMutation.isPending ? 'Crediting deposit...' : 'Credit deposit'}
              </Button>
            </form>
          </Panel>

          <Panel className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Withdrawal request</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{formatUsdt(wallet.locked_balance)} USDT locked</h3>
              </div>
              <StatusBadge tone="neutral">Pending payout rail</StatusBadge>
            </div>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                withdrawMutation.mutate()
              }}
            >
              <Input
                type="number"
                min={1}
                step="0.01"
                value={withdrawForm.amount}
                onChange={(event) => setWithdrawForm((current) => ({ ...current, amount: Number(event.target.value) }))}
              />
              <Select value={withdrawForm.network} onChange={(event) => setWithdrawForm((current) => ({ ...current, network: event.target.value as SupportedNetwork }))}>
                <option value="TRC20">TRC20</option>
                <option value="BEP20">BEP20</option>
              </Select>
              <Textarea
                placeholder="Destination wallet address"
                value={withdrawForm.wallet_address}
                onChange={(event) => setWithdrawForm((current) => ({ ...current, wallet_address: event.target.value }))}
              />
              <Button type="submit" disabled={!isKycVerified || withdrawMutation.isPending}>
                {withdrawMutation.isPending ? 'Submitting request...' : 'Request withdrawal'}
              </Button>
            </form>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">VIP plans</p>
          <div className="grid gap-3">
            {([
              { plan: 'monthly', label: 'Monthly', price: '30 USDT', detail: 'Zero winner fees for 30 days.' },
              { plan: 'yearly', label: 'Yearly', price: '300 USDT', detail: 'Zero winner fees for 12 months.' },
            ] as const).map((item) => (
              <div key={item.plan} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-sm text-zinc-400">{item.detail}</p>
                  </div>
                  <p className="text-sm font-semibold text-signal-orange">{item.price}</p>
                </div>
                <Button type="button" className="mt-4 w-full" onClick={() => vipMutation.mutate(item.plan as VipPlan)} disabled={vipMutation.isPending}>
                  {vipMutation.isPending ? 'Processing...' : `Buy ${item.label}`}
                </Button>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-zinc-400">Pending withdrawals</p>
            <ul className="mt-3 space-y-2">
              {withdrawals.length > 0 ? (
                withdrawals.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm text-zinc-300">
                    <span>{formatUsdt(item.amount)} USDT</span>
                    <StatusBadge tone={item.status === 'completed' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>
                      {item.status}
                    </StatusBadge>
                  </li>
                ))
              ) : (
                <li className="text-sm text-zinc-500">No withdrawal requests yet.</li>
              )}
            </ul>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Transaction history</p>
            {transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-zinc-300">
                  <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    <tr>
                      <th className="pb-3">Type</th>
                      <th className="pb-3">Amount</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="py-3 capitalize">{transactionLabel(transaction.type)}</td>
                        <td className="py-3">{formatUsdt(transaction.amount)} USDT</td>
                        <td className="py-3">
                          <StatusBadge tone={transaction.status === 'completed' ? 'success' : transaction.status === 'failed' ? 'danger' : 'warning'}>
                            {transaction.status}
                          </StatusBadge>
                        </td>
                        <td className="py-3 text-zinc-500">{formatDateTime(transaction.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No transactions yet" message="Wallet activity will appear here once deposits, stakes, or payouts are processed." />
            )}
          </Panel>

          <Panel className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Audit trail</p>
            {auditLogs.length > 0 ? (
              <div className="space-y-3">
                {auditLogs.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{entry.reason ?? 'balance update'}</p>
                      <p className="text-xs text-zinc-500">{formatDateTime(entry.created_at)}</p>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      Available {formatUsdt(entry.old_balance)} to {formatUsdt(entry.new_balance)} USDT
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Locked {formatUsdt(entry.old_locked_balance)} to {formatUsdt(entry.new_locked_balance)} USDT
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No audit entries" message="Each atomic wallet operation will write a balance audit record here." />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
