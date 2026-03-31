import type {
  DepositInput,
  VipPurchaseInput,
  Wallet,
  WalletAuditLog,
  WalletTransaction,
  WithdrawalInput,
  WithdrawalRequest,
} from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapWallet, mapWalletAuditLog, mapWalletTransaction, mapWithdrawalRequest } from '../lib/mappers';
import { asRow, isSupabaseNoRowsError } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

const TRANSACTION_COLUMNS = [
  'id',
  'user_id',
  'type',
  'amount',
  'status',
  'network',
  'tx_hash',
  'idempotency_key',
  'reference_type',
  'reference_id',
  'balance_before',
  'balance_after',
  'locked_before',
  'locked_after',
  'notes',
  'metadata',
  'created_at',
  'processed_at',
].join(', ');

export async function getWallet(userId: string): Promise<Wallet> {
  const { data, error } = await serviceRoleClient
    .from('wallets')
    .select('user_id, balance, locked_balance, updated_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (isSupabaseNoRowsError(error)) {
      const { error: insertError } = await serviceRoleClient.from('wallets').insert({ user_id: userId });

      if (insertError) {
        throw new AppError(500, 'WALLET_BOOTSTRAP_FAILED', insertError.message);
      }

      return getWallet(userId);
    }

    throw new AppError(500, 'WALLET_FETCH_FAILED', error.message);
  }

  return mapWallet(asRow(data));
}

export async function getTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
  const { data, error } = await serviceRoleClient
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, 'TRANSACTIONS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapWalletTransaction(asRow(row)));
}

export async function getWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await serviceRoleClient
    .from('withdrawal_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(500, 'WITHDRAWALS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapWithdrawalRequest(asRow(row)));
}

export async function getAuditLogs(userId: string): Promise<WalletAuditLog[]> {
  const { data, error } = await serviceRoleClient
    .from('wallet_audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new AppError(500, 'AUDIT_LOGS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapWalletAuditLog(asRow(row)));
}

async function runWalletRpc(functionName: string, params: Record<string, unknown>) {
  const { data, error } = await serviceRoleClient.rpc(functionName, params);

  if (error) {
    const code = error.message.includes('INSUFFICIENT') ? 409 : 500;
    throw new AppError(code, 'WALLET_OPERATION_FAILED', error.message);
  }

  return asRow(data);
}

export async function creditDeposit(userId: string, input: DepositInput): Promise<WalletTransaction> {
  const row = await runWalletRpc('wallet_apply_operation', {
    p_user_id: userId,
    p_amount: input.amount,
    p_locked_delta: 0,
    p_type: 'deposit',
    p_status: 'completed',
    p_idempotency_key: input.idempotency_key,
    p_network: input.network,
    p_reference_type: 'deposit',
    p_reference_id: null,
    p_notes: 'Off-chain custodial deposit credited',
    p_metadata: {
      tx_hash: input.tx_hash ?? null,
    },
  });

  return mapWalletTransaction(row);
}

export async function requestWithdrawal(userId: string, input: WithdrawalInput): Promise<WithdrawalRequest> {
  const { data, error } = await serviceRoleClient.rpc('wallet_request_withdrawal', {
    p_user_id: userId,
    p_amount: input.amount,
    p_network: input.network,
    p_wallet_address: input.wallet_address,
    p_idempotency_key: input.idempotency_key,
  });

  if (error) {
    const code = error.message.includes('INSUFFICIENT') ? 409 : 500;
    throw new AppError(code, 'WITHDRAWAL_CREATE_FAILED', error.message);
  }

  return mapWithdrawalRequest(asRow(data));
}

export async function purchaseVip(userId: string, input: VipPurchaseInput) {
  const { data, error } = await serviceRoleClient.rpc('wallet_purchase_vip', {
    p_user_id: userId,
    p_plan_type: input.plan_type,
    p_idempotency_key: input.idempotency_key,
  });

  if (error) {
    const code = error.message.includes('INSUFFICIENT') ? 409 : 500;
    throw new AppError(code, 'VIP_PURCHASE_FAILED', error.message);
  }

  return asRow(data);
}

export async function lockStake(userId: string, matchId: string, amount: number, idempotencyKey: string) {
  return mapWalletTransaction(
    await runWalletRpc('wallet_apply_operation', {
      p_user_id: userId,
      p_amount: amount * -1,
      p_locked_delta: amount,
      p_type: 'stake_lock',
      p_status: 'completed',
      p_idempotency_key: idempotencyKey,
      p_reference_type: 'match',
      p_reference_id: matchId,
      p_notes: 'Stake locked for match entry',
      p_metadata: {
        match_id: matchId,
      },
    }),
  );
}

export async function releaseStake(userId: string, matchId: string, amount: number, idempotencyKey: string) {
  return mapWalletTransaction(
    await runWalletRpc('wallet_apply_operation', {
      p_user_id: userId,
      p_amount: amount,
      p_locked_delta: amount * -1,
      p_type: 'stake_release',
      p_status: 'completed',
      p_idempotency_key: idempotencyKey,
      p_reference_type: 'match',
      p_reference_id: matchId,
      p_notes: 'Stake released back to wallet',
      p_metadata: {
        match_id: matchId,
      },
    }),
  );
}
