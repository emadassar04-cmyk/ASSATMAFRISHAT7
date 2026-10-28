import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { createClient } from '@/lib/supabase/server';
import { CheckoutForm } from './CheckoutForm';

export const metadata: Metadata = { title: 'إتمام الطلب', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/checkout');
  const s = await getSettings();
  const [{ data: branches }, { data: zones }, { data: customer }] = await Promise.all([
    supabase.from('branches').select('id, name, address').eq('is_active', true).order('sort_order'),
    supabase.from('delivery_zones').select('id, name, fee, fee_on_agreement').eq('is_active', true).order('name'),
    supabase.from('customers').select('phone').eq('profile_id', user.id).maybeSingle(),
  ]);
  const deliveryOn = (s as unknown as Record<string, { enabled?: boolean } | undefined>)['delivery']?.enabled === true;
  const exchange = s['policy.exchange'] as { title?: string; summary?: string } | undefined;

  return (
    <main className="container-page max-w-3xl space-y-4 py-8">
      <h1 className="text-xl font-bold">إتمام الطلب</h1>
      <CheckoutForm
        branches={(branches ?? []) as { id: string; name: string; address: string | null }[]}
        zones={deliveryOn ? ((zones ?? []) as { id: string; name: string; fee: number; fee_on_agreement: boolean }[]) : []}
        defaultPhone={customer?.phone ?? ''}
        hasWhatsapp={!!s.contact.whatsapp && /\d{8,}/.test(s.contact.whatsapp)}
        hasFacebook={/^https?:\/\//.test(s.contact.facebook ?? '')}
        policySummary={exchange?.summary ?? exchange?.title ?? 'سياسة الاستبدال'}
      />
    </main>
  );
}
