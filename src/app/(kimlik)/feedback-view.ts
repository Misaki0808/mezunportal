import 'server-only';
import { cache } from 'react';
import { getFeedbackView } from '@/server/actions/feedback';

/** Aynı sunucu render isteğinde, aynı görüşme için yetki ve görünüm yalnız bir kez hesaplanır. */
export const getRequestFeedbackView = cache(getFeedbackView);
