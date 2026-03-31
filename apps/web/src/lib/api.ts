import { supabase } from './supabase'

export class ApiError extends Error {
  code?: string
  details?: Record<string, unknown>

  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function getApiBaseUrl() {
  return configuredBaseUrl
}

function getApiUrl(path: string) {
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/api${path}`
  }

  return `/api${path}`
}

export async function apiRequest<TData>(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const response = await fetch(getApiUrl(path), {
    ...init,
    headers,
  })

  if (response.status === 204) {
    return null as TData
  }

  const payload = (await response.json()) as
    | { data: TData }
    | { error: { message: string; code?: string; details?: Record<string, unknown> } }

  if (!response.ok || 'error' in payload) {
    const errorPayload = 'error' in payload ? payload.error : { message: 'Request failed' }
    throw new ApiError(errorPayload.message, errorPayload.code, errorPayload.details)
  }

  return payload.data
}
