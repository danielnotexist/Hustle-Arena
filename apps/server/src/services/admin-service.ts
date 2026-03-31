import type { AdminDashboardPayload, AdminProfilePreview, KycSubmission, Profile, RiskEvent, Wallet, WithdrawalRequest } from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapKycSubmission, mapProfile, mapRiskEvent, mapWallet, mapWithdrawalRequest } from '../lib/mappers';
import { asRow } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

const PROFILE_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'bio',
  'steam_handle',
  'country_code',
  'elo_rating',
  'rank_tier',
  'kyc_status',
  'kyc_rejection_reason',
  'is_admin',
  'is_vip',
  'vip_expires_at',
  'total_matches',
  'wins',
  'losses',
  'total_earnings',
  'total_volume',
  'preferred_maps',
  'created_at',
  'updated_at',
].join(', ');

const ADMIN_PROFILE_PREVIEW_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'kyc_status',
  'is_admin',
  'is_vip',
  'vip_expires_at',
  'elo_rating',
  'country_code',
  'created_at',
  'updated_at',
].join(', ');

function toAdminPreview(row: Record<string, unknown>): AdminProfilePreview {
  const profile = mapProfile(row);

  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    kyc_status: profile.kyc_status,
    is_admin: profile.is_admin,
    is_vip: profile.is_vip,
    vip_expires_at: profile.vip_expires_at,
    elo_rating: profile.elo_rating,
    country_code: profile.country_code,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

async function insertOpsReviewEvent(input: {
  actorId: string;
  userId: string | null;
  severity: RiskEvent['severity'];
  payload: Record<string, unknown>;
}) {
  const { error } = await serviceRoleClient.from('risk_events').insert({
    user_id: input.userId,
    event_type: 'ops_review',
    severity: input.severity,
    payload: {
      actor_id: input.actorId,
      ...input.payload,
    },
  });

  if (error) {
    throw new AppError(500, 'OPS_REVIEW_LOG_FAILED', error.message);
  }
}

async function countRows(table: string, column = '*') {
  const { count, error } = await serviceRoleClient.from(table).select(column, { count: 'exact', head: true });

  if (error) {
    throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
  }

  return count ?? 0;
}

async function runWalletOperation(params: Record<string, unknown>) {
  const { data, error } = await serviceRoleClient.rpc('wallet_apply_operation', params);

  if (error) {
    const code = error.message.includes('INSUFFICIENT') ? 409 : 500;
    throw new AppError(code, 'ADMIN_WALLET_OPERATION_FAILED', error.message);
  }

  return asRow(data);
}

export async function getAdminDashboard(): Promise<AdminDashboardPayload> {
  const [
    { data: profiles, error: profilesError },
    { data: pendingKycRows, error: pendingKycError },
    { data: pendingWithdrawalRows, error: pendingWithdrawalError },
    { data: riskRows, error: riskError },
    { data: walletRows, error: walletsError },
    totalUsers,
    adminUsers,
    verifiedKyc,
    pendingKyc,
    pendingWithdrawals,
    activeMatches,
  ] = await Promise.all([
    serviceRoleClient.from('profiles').select(PROFILE_COLUMNS).order('created_at', { ascending: false }).limit(24),
    serviceRoleClient
      .from('kyc_submissions')
      .select(
        `id, user_id, legal_name, date_of_birth, country_code, document_type, document_number, status, notes, reviewed_by, reviewed_at, created_at, updated_at, profile:profiles!kyc_submissions_user_id_fkey(${ADMIN_PROFILE_PREVIEW_COLUMNS})`,
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(12),
    serviceRoleClient
      .from('withdrawal_requests')
      .select(
        `id, user_id, amount, network, wallet_address, status, transaction_id, rejection_reason, created_at, updated_at, profile:profiles!withdrawal_requests_user_id_fkey(${ADMIN_PROFILE_PREVIEW_COLUMNS})`,
      )
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(12),
    serviceRoleClient.from('risk_events').select('id, user_id, match_id, event_type, severity, payload, created_at').order('created_at', { ascending: false }).limit(12),
    serviceRoleClient.from('wallets').select('user_id, balance, locked_balance, updated_at'),
    countRows('profiles'),
    serviceRoleClient.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', true).then(({ count, error }) => {
      if (error) {
        throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
      }

      return count ?? 0;
    }),
    serviceRoleClient.from('profiles').select('id', { count: 'exact', head: true }).eq('kyc_status', 'verified').then(({ count, error }) => {
      if (error) {
        throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
      }

      return count ?? 0;
    }),
    serviceRoleClient.from('kyc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count, error }) => {
      if (error) {
        throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
      }

      return count ?? 0;
    }),
    serviceRoleClient.from('withdrawal_requests').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']).then(({ count, error }) => {
      if (error) {
        throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
      }

      return count ?? 0;
    }),
    serviceRoleClient
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(completed,cancelled)')
      .then(({ count, error }) => {
        if (error) {
          throw new AppError(500, 'ADMIN_COUNT_FAILED', error.message);
        }

        return count ?? 0;
      }),
  ]);

  if (profilesError) {
    throw new AppError(500, 'ADMIN_PROFILES_FETCH_FAILED', profilesError.message);
  }

  if (pendingKycError) {
    throw new AppError(500, 'ADMIN_KYC_FETCH_FAILED', pendingKycError.message);
  }

  if (pendingWithdrawalError) {
    throw new AppError(500, 'ADMIN_WITHDRAWALS_FETCH_FAILED', pendingWithdrawalError.message);
  }

  if (riskError) {
    throw new AppError(500, 'ADMIN_RISK_FETCH_FAILED', riskError.message);
  }

  if (walletsError) {
    throw new AppError(500, 'ADMIN_WALLETS_FETCH_FAILED', walletsError.message);
  }

  const walletsByUser = new Map<string, Wallet>();
  let totalAvailableBalance = 0;
  let totalLockedBalance = 0;

  (walletRows ?? []).forEach((row) => {
    const wallet = mapWallet(asRow(row));
    walletsByUser.set(wallet.user_id, wallet);
    totalAvailableBalance += wallet.balance;
    totalLockedBalance += wallet.locked_balance;
  });

  return {
    summary: {
      totalUsers,
      adminUsers,
      verifiedKyc,
      pendingKyc,
      pendingWithdrawals,
      activeMatches,
      totalAvailableBalance,
      totalLockedBalance,
    },
    users: (profiles ?? []).map((row) => {
      const profile = mapProfile(asRow(row));
      return {
        profile,
        wallet: walletsByUser.get(profile.id) ?? null,
      };
    }),
    pendingKyc: (pendingKycRows ?? []).map((row) => {
      const rowData = asRow(row);
      return {
        submission: mapKycSubmission(rowData),
        profile: toAdminPreview(asRow(rowData.profile)),
      };
    }),
    pendingWithdrawals: (pendingWithdrawalRows ?? []).map((row) => {
      const rowData = asRow(row);
      return {
        request: mapWithdrawalRequest(rowData),
        profile: toAdminPreview(asRow(rowData.profile)),
      };
    }),
    riskEvents: (riskRows ?? []).map((row) => mapRiskEvent(asRow(row))),
  };
}

export async function reviewKycSubmission(
  actorId: string,
  submissionId: string,
  input: { status: KycSubmission['status']; reason?: string; notes?: string },
) {
  const { data: existingRow, error: fetchError } = await serviceRoleClient
    .from('kyc_submissions')
    .select('id, user_id, legal_name, date_of_birth, country_code, document_type, document_number, status, notes, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('id', submissionId)
    .single();

  if (fetchError || !existingRow) {
    throw new AppError(404, 'KYC_NOT_FOUND', 'KYC submission not found');
  }

  const existing = mapKycSubmission(asRow(existingRow));
  const nextNotes =
    input.notes?.trim() ||
    existing.notes ||
    (input.status === 'verified' ? 'Approved by admin review' : input.reason?.trim() || 'Rejected by admin review');

  const { data: updatedRow, error: updateError } = await serviceRoleClient
    .from('kyc_submissions')
    .update({
      status: input.status,
      notes: nextNotes,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .select('id, user_id, legal_name, date_of_birth, country_code, document_type, document_number, status, notes, reviewed_by, reviewed_at, created_at, updated_at')
    .single();

  if (updateError || !updatedRow) {
    throw new AppError(500, 'KYC_REVIEW_FAILED', updateError?.message ?? 'KYC update failed');
  }

  const { error: profileError } = await serviceRoleClient
    .from('profiles')
    .update({
      kyc_status: input.status,
      kyc_rejection_reason: input.status === 'rejected' ? input.reason?.trim() || 'Rejected by admin review' : null,
    })
    .eq('id', existing.user_id);

  if (profileError) {
    throw new AppError(500, 'KYC_PROFILE_UPDATE_FAILED', profileError.message);
  }

  await insertOpsReviewEvent({
    actorId,
    userId: existing.user_id,
    severity: input.status === 'verified' ? 'low' : 'medium',
    payload: {
      entity: 'kyc_submission',
      submission_id: submissionId,
      decision: input.status,
      reason: input.reason?.trim() || null,
      notes: nextNotes,
    },
  });

  return mapKycSubmission(asRow(updatedRow));
}

export async function reviewWithdrawalRequest(
  actorId: string,
  requestId: string,
  input: { decision: 'approve' | 'reject'; reason?: string; tx_hash?: string },
) {
  const { data: existingRow, error: fetchError } = await serviceRoleClient
    .from('withdrawal_requests')
    .select('id, user_id, amount, network, wallet_address, status, transaction_id, rejection_reason, created_at, updated_at')
    .eq('id', requestId)
    .single();

  if (fetchError || !existingRow) {
    throw new AppError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal request not found');
  }

  const request = mapWithdrawalRequest(asRow(existingRow));

  if (!['pending', 'processing'].includes(request.status)) {
    throw new AppError(409, 'WITHDRAWAL_ALREADY_REVIEWED', 'Withdrawal request has already been reviewed');
  }

  if (request.transaction_id) {
    const { error: transactionError } = await serviceRoleClient
      .from('transactions')
      .update({
        status: input.decision === 'approve' ? 'completed' : 'cancelled',
        tx_hash: input.tx_hash?.trim() || null,
        notes:
          input.decision === 'approve'
            ? 'Withdrawal completed by admin'
            : `Withdrawal rejected by admin${input.reason?.trim() ? `: ${input.reason.trim()}` : ''}`,
        processed_at: new Date().toISOString(),
      })
      .eq('id', request.transaction_id);

    if (transactionError) {
      throw new AppError(500, 'WITHDRAWAL_TRANSACTION_UPDATE_FAILED', transactionError.message);
    }
  }

  if (input.decision === 'reject') {
    await runWalletOperation({
      p_user_id: request.user_id,
      p_amount: request.amount,
      p_locked_delta: 0,
      p_type: 'withdraw_rejected',
      p_status: 'completed',
      p_idempotency_key: `withdrawal-rejected:${request.id}`,
      p_network: request.network,
      p_reference_type: 'withdrawal_request',
      p_reference_id: request.id,
      p_notes: input.reason?.trim() ? `Withdrawal rejected: ${input.reason.trim()}` : 'Withdrawal rejected by admin',
      p_metadata: {
        reviewed_by: actorId,
        original_transaction_id: request.transaction_id,
        reason: input.reason?.trim() || null,
      },
    });
  }

  const { data: updatedRow, error: updateError } = await serviceRoleClient
    .from('withdrawal_requests')
    .update({
      status: input.decision === 'approve' ? 'completed' : 'rejected',
      rejection_reason: input.decision === 'reject' ? input.reason?.trim() || 'Rejected by admin review' : null,
    })
    .eq('id', requestId)
    .select('id, user_id, amount, network, wallet_address, status, transaction_id, rejection_reason, created_at, updated_at')
    .single();

  if (updateError || !updatedRow) {
    throw new AppError(500, 'WITHDRAWAL_REVIEW_FAILED', updateError?.message ?? 'Withdrawal update failed');
  }

  await insertOpsReviewEvent({
    actorId,
    userId: request.user_id,
    severity: input.decision === 'approve' ? 'low' : 'medium',
    payload: {
      entity: 'withdrawal_request',
      request_id: requestId,
      decision: input.decision,
      tx_hash: input.tx_hash?.trim() || null,
      reason: input.reason?.trim() || null,
    },
  });

  return mapWithdrawalRequest(asRow(updatedRow));
}

export async function updateAdminRole(actorId: string, targetUserId: string, isAdmin: boolean) {
  if (actorId === targetUserId && !isAdmin) {
    throw new AppError(400, 'ADMIN_SELF_REVOKE_FORBIDDEN', 'You cannot revoke your own admin role');
  }

  const { data, error } = await serviceRoleClient
    .from('profiles')
    .update({
      is_admin: isAdmin,
    })
    .eq('id', targetUserId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    throw new AppError(500, 'ADMIN_ROLE_UPDATE_FAILED', error?.message ?? 'Admin role update failed');
  }

  await insertOpsReviewEvent({
    actorId,
    userId: targetUserId,
    severity: 'medium',
    payload: {
      entity: 'profile',
      action: isAdmin ? 'grant_admin' : 'revoke_admin',
    },
  });

  return mapProfile(asRow(data));
}
