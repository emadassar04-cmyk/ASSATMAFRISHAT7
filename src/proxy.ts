import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export function proxy(request: NextRequest) {
  return updateSession(request);
}

// يعمل فقط على المسارات التي تحتاج جلسة، لإبقاء الواجهة العامة قابلة للكاش
export const config = { matcher: ['/dashboard/:path*', '/account/:path*', '/checkout', '/orders/:path*', '/custom-order', '/custom-orders/:path*', '/mfa', '/api/auth/:path*'] };
