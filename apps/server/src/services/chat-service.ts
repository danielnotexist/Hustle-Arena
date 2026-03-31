import type { DirectMessage, SendMessageInput } from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapMessage } from '../lib/mappers';
import { asRow } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

export async function getInbox(userId: string, limit = 50): Promise<DirectMessage[]> {
  const { data, error } = await serviceRoleClient
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, 'MESSAGES_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapMessage(asRow(row)));
}

export async function sendMessage(userId: string, input: SendMessageInput): Promise<DirectMessage> {
  if (!input.receiver_id && !input.match_id) {
    throw new AppError(400, 'MESSAGE_INVALID', 'Message must target a user or a match');
  }

  const { data, error } = await serviceRoleClient
    .from('messages')
    .insert({
      sender_id: userId,
      receiver_id: input.receiver_id ?? null,
      match_id: input.match_id ?? null,
      content: input.content,
      team_only: input.team_only ?? false,
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError(500, 'MESSAGE_CREATE_FAILED', error.message);
  }

  return mapMessage(asRow(data));
}
