import type { KycSubmission, KycSubmissionInput } from '@hustle-arena/shared-types';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { mapKycSubmission } from '../lib/mappers';
import { asRow } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

export async function getLatestKycSubmission(userId: string): Promise<KycSubmission | null> {
  const { data, error } = await serviceRoleClient
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }

    throw new AppError(500, 'KYC_FETCH_FAILED', error.message);
  }

  return mapKycSubmission(asRow(data));
}

export async function submitKyc(userId: string, input: KycSubmissionInput): Promise<KycSubmission> {
  const status = env.autoApproveKyc ? 'verified' : 'pending';

  const { data, error } = await serviceRoleClient
    .from('kyc_submissions')
    .insert({
      user_id: userId,
      legal_name: input.legal_name,
      date_of_birth: input.date_of_birth,
      country_code: input.country_code,
      document_type: input.document_type,
      document_number: input.document_number,
      status,
      reviewed_at: env.autoApproveKyc ? new Date().toISOString() : null,
      notes: env.autoApproveKyc ? 'Automatically approved by MVP KYC flow' : null,
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError(500, 'KYC_SUBMIT_FAILED', error.message);
  }

  const { error: profileError } = await serviceRoleClient
    .from('profiles')
    .update({
      kyc_status: status,
      kyc_rejection_reason: null,
      country_code: input.country_code,
    })
    .eq('id', userId);

  if (profileError) {
    throw new AppError(500, 'KYC_PROFILE_UPDATE_FAILED', profileError.message);
  }

  return mapKycSubmission(asRow(data));
}
