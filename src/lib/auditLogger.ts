import { api } from './api';
import { getDbPath } from './tenant';

export enum AuditAction {
  EMAIL_SENT = 'Email Sent',
  BOOKING_CREATED = 'Booking Created',
  BOOKING_EDITED = 'Booking Edited',
  BOOKING_DELETED = 'Booking Deleted',
  AUTH_COMPLETED = 'Authorization Completed',
  DRAFT_SAVED = 'Draft Saved',
  USER_CREATED = 'User Created',
  USER_EDITED = 'User Edited',
  USER_DELETED = 'User Deleted'
}

export const logAudit = async (action: AuditAction, details: string, bookingId?: string, clientId?: string | null) => {
  try {
    const defaultClientId = localStorage.getItem('tenantId');
    const activeClientId = clientId !== undefined ? clientId : defaultClientId;

    await api.post('/audit-logs', {
      action,
      details,
      bookingId: bookingId || null,
      tenantId: activeClientId
    });
  } catch (error) {
    console.error('Failed to log audit activity:', error);
  }
};
