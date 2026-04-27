import { supabase } from "../supabase";
import type { MatchServerBootstrap } from "./matchmaking";

export type ServerProvider = "gcp-test" | (string & {});
export type ServerInstanceStatus =
  | "requested"
  | "allocation_claimed"
  | "provisioning"
  | "booting"
  | "ready"
  | "live"
  | "draining"
  | "terminated"
  | "failed";

export type MatchLifecycleJobType =
  | "allocate_server"
  | "monitor_server"
  | "teardown_server"
  | "settle_match"
  | "refund_interrupted_match";

export type MatchLifecycleJobStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";

export interface MatchServerAllocationClaim {
  job_id: number;
  match_id: string;
  server_instance_id: string;
  server_config: MatchServerBootstrap;
  provider: ServerProvider;
  provider_region: string | null;
}

export interface ServerInstanceRecord {
  id: string;
  match_id: string;
  game_key: "cs2" | string;
  provider: ServerProvider;
  provider_region?: string | null;
  provider_instance_id?: string | null;
  status: ServerInstanceStatus;
  endpoint?: string | null;
  public_ip?: string | null;
  connect_password_required: boolean;
  worker_id?: string | null;
  claim_expires_at?: string | null;
  metadata: Record<string, unknown>;
  requested_at: string;
  allocation_claimed_at?: string | null;
  provisioning_started_at?: string | null;
  booted_at?: string | null;
  ready_at?: string | null;
  live_at?: string | null;
  draining_at?: string | null;
  terminated_at?: string | null;
  failed_at?: string | null;
  last_heartbeat_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchLifecycleJobRecord {
  id: number;
  match_id: string;
  job_type: MatchLifecycleJobType;
  status: MatchLifecycleJobStatus;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  claimed_by?: string | null;
  claim_expires_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MatchServerTelemetryEventRecord {
  id: number;
  match_id: string;
  server_instance_id?: string | null;
  event_id?: string | null;
  event_type: string;
  source: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  received_at: string;
}

export async function queueMatchServerAllocation(input: {
  matchId: string;
  provider?: ServerProvider;
  providerRegion?: string | null;
}) {
  const { data, error } = await supabase.rpc("queue_match_server_allocation", {
    p_match_id: input.matchId,
    p_provider: input.provider || "gcp-test",
    p_provider_region: input.providerRegion || null,
  });

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function claimNextMatchServerAllocation(input: {
  workerId: string;
  provider?: ServerProvider;
  providerRegion?: string | null;
  claimSeconds?: number;
}) {
  const { data, error } = await supabase.rpc("claim_next_match_server_allocation", {
    p_worker_id: input.workerId,
    p_provider: input.provider || "gcp-test",
    p_provider_region: input.providerRegion || null,
    p_claim_seconds: input.claimSeconds || 120,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row || null) as MatchServerAllocationClaim | null;
}

export async function recordMatchServerStatus(input: {
  matchId: string;
  status: ServerInstanceStatus;
  providerInstanceId?: string | null;
  endpoint?: string | null;
  publicIp?: string | null;
  metadata?: Record<string, unknown>;
  failureReason?: string | null;
}) {
  const { data, error } = await supabase.rpc("record_match_server_status", {
    p_match_id: input.matchId,
    p_status: input.status,
    p_provider_instance_id: input.providerInstanceId || null,
    p_endpoint: input.endpoint || null,
    p_public_ip: input.publicIp || null,
    p_metadata: input.metadata || {},
    p_failure_reason: input.failureReason || null,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function recordMatchServerHeartbeat(input: {
  matchId: string;
  providerInstanceId?: string | null;
  status?: ServerInstanceStatus | null;
  payload?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("record_match_server_heartbeat", {
    p_match_id: input.matchId,
    p_provider_instance_id: input.providerInstanceId || null,
    p_status: input.status || null,
    p_payload: input.payload || {},
  });

  if (error) {
    throw error;
  }
}

export async function recordMatchServerTelemetry(input: {
  matchId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  eventId?: string | null;
  occurredAt?: string | null;
  source?: string;
}) {
  const { data, error } = await supabase.rpc("record_match_server_telemetry", {
    p_match_id: input.matchId,
    p_event_type: input.eventType,
    p_payload: input.payload || {},
    p_event_id: input.eventId || null,
    p_occurred_at: input.occurredAt || null,
    p_source: input.source || "server-agent",
  });

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function queueMatchServerTeardown(input: {
  matchId: string;
  reason?: string | null;
}) {
  const { data, error } = await supabase.rpc("queue_match_server_teardown", {
    p_match_id: input.matchId,
    p_reason: input.reason || null,
  });

  if (error) {
    throw error;
  }

  return Number(data);
}

export async function fetchServerInstanceForMatch(matchId: string) {
  const { data, error } = await supabase
    .from("server_instances")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data || null) as ServerInstanceRecord | null;
}

export async function fetchMatchLifecycleJobs(matchId: string) {
  const { data, error } = await supabase
    .from("match_lifecycle_jobs")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []) as MatchLifecycleJobRecord[];
}

export async function fetchMatchServerTelemetryEvents(matchId: string, limit = 100) {
  const { data, error } = await supabase
    .from("match_server_telemetry_events")
    .select("*")
    .eq("match_id", matchId)
    .order("received_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) {
    throw error;
  }

  return (data || []) as MatchServerTelemetryEventRecord[];
}
