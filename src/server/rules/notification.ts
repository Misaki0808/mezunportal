import type { NotificationType } from '@/contracts/notifications';

/** Tek bir sınıflandırma: bilinmeyen şablon kapalı kalır, yeni tür açıkça kaydedilir. */
export function notificationTypeForTemplate(template: string): NotificationType | null {
  switch (template) {
    case 'auth.sign-in-link':
    case 'auth.change-email-confirmation':
    case 'auth.change-email-verification':
      return 'ACCOUNT_SECURITY';
    case 'graduation-document.approved':
    case 'graduation-document.rejected':
      return 'GRADUATION_DECISION';
    case 'experience.moderation-approved':
    case 'experience.moderation-rejected':
      return 'EXPERIENCE_MODERATION';
    case 'contact.requested':
      return 'CONTACT_REQUEST';
    case 'cv.review.requested':
    case 'cv.review.answered':
    case 'cv.review.expired':
      return 'CV_REVIEW';
    case 'cv.invitation':
      return 'CV_INVITATION';
    case 'profile.freshness':
      return 'PROFILE_FRESHNESS';
    case 'alumni.still-there':
      return 'ALUMNI_STILL_THERE';
    case 'student.email-migration':
      return 'STUDENT_EMAIL_MIGRATION';
    case 'appointment.feedback':
    case 'appointment.requested':
    case 'appointment.confirmed':
    case 'appointment.declined':
    case 'appointment.cancelled':
    case 'appointment.expired':
    case 'appointment.reminder':
    case 'appointment.linkNeeded':
    case 'appointment.linkAdded':
    case 'appointment.placeholder':
      return 'APPOINTMENT';
    case 'faq.published':
    case 'faq.rejected':
    case 'faq.redirected':
    case 'faq.answerPublished':
      return 'FAQ';
    case 'jobMatch.digest':
      return 'JOB_MATCH';
    case 'applicationWindow.reminder':
      return 'APPLICATION_WINDOW';
    case 'jobPosting.published':
    case 'jobPosting.rejected':
    case 'jobPosting.expired':
      return 'JOB_POSTING';
    default:
      return null;
  }
}
