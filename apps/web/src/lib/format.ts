import type { KycStatus, TransactionType } from '@hustle-arena/shared-types'

export function formatUsdt(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function kycLabel(status: KycStatus) {
  if (status === 'verified') {
    return 'Verified'
  }

  if (status === 'rejected') {
    return 'Rejected'
  }

  return 'Pending review'
}

export function transactionLabel(type: TransactionType) {
  return type.replace(/_/g, ' ')
}

export function shortId(value: string) {
  if (value.length < 12) {
    return value
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
