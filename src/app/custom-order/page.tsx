import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { createClient } from '@/lib/supabase/server';
import { CustomOrderForm } from './CustomOrderForm';

export const metadata: Metadata = { title: 'طلب تفصيل', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CustomOrderPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/custom-order');
  const s = await getSettings();
  const [{ data: branches }, { data: customer }] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('customers').select('phone').eq('profile_id', user.id).maybeSingle(),
  ]);
  const policy = s['policy.custom_orders'] as { title?: string; summary?: string } | undefined;
  return (
    <main className="container-page max-w-3xl space-y-4 py-8">
      <h1 className="text-xl font-bold">طلب تفصيل</h1>
      <p className="text-sm text-muted">صف القطعة التي تريدها (المقاس والخامة واللون) وأرفق صورة مرجعية. نسعّرها ونتواصل معك للاتفاق.</p>
      <CustomOrderForm
        branches={(branches ?? []) as { id: string; name: string }[]}
        defaultPhone={customer?.phone ?? ''}
        hasWhatsapp={!!s.contact.whatsapp && /\d{8,}/.test(s.contact.whatsapp)}
        hasFacebook={/^https?:\/\//.test(s.contact.facebook ?? '')}
        deposit={s.deposit?.enabled && s.deposit.percent > 0 ? s.deposit.percent : 0}
        policySummary={policy?.summary ?? policy?.title ?? 'شروط الطلبات المفصّلة'}
      />
    </main>
  );
}
