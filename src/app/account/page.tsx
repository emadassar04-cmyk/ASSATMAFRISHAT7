import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'حسابي', robots: { index: false } };

/** لوحة الزبون الكاملة (الطلبات، الإيصالات، المفضلة) في المرحلة 2 */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/account');
  const { data: profile } = await supabase.from('profiles').select('phone, full_name, role').eq('id', user.id).single();
  if (profile?.role === 'admin' || profile?.role === 'moderator') redirect('/dashboard');
  return (
    <main className="container-page max-w-lg space-y-4 py-10">
      <h1 className="text-xl font-bold">حسابي</h1>
      <div className="card space-y-1 p-5 text-sm">
        <p>الجوال: <bdi>{profile?.phone}</bdi></p>
        <p>الاسم: {profile?.full_name ?? '—'}</p>
        <p className="pt-2 text-muted">طلباتي ومفضلتي ستتوفر مع تفعيل الطلبات.</p>
      </div>
      <form action="/api/auth/logout" method="post"><button className="btn btn-outline">تسجيل الخروج</button></form>
    </main>
  );
}
