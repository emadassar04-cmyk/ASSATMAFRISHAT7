'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** رابط الدخول/حسابي: يقرأ الجلسة من المتصفح كي تبقى الصفحات العامة قابلة للكاش */
export function AccountLink() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  if (signedIn === null) return <span className="w-14" />;
  return signedIn
    ? <Link href="/account" className="btn btn-outline btn-sm">حسابي</Link>
    : <Link href="/login" className="btn btn-primary btn-sm">دخول</Link>;
}
