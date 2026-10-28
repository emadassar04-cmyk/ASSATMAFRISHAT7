import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CUSTOM_STATUS_CLASS, CUSTOM_STATUS_LABEL, customerCanCancelCustom, type CustomStatus } from '@/lib/customOrder';
import { formatPrice, messengerLink, waLink } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { createClient } from '@/lib/supabase/server';
import { cancelCustomOrder } from './actions';

export const metadata: Metadata = { title: 'طلب التفصيل', robots: { index: false } };
export const dynamic = 'force-dynamic';

interface Row {
  id: string; status: CustomStatus; description: string; dimensions: string | null; material: string | null; color: string | null;
  reference_image_paths: string[]; quoted_price: number | null; deposit_percent: number | null; deposit_amount: number | null;
  quote_note: string | null; contact_phone: string | null; contact_preference: string | null; cancelled_reason: string | null;
  created_at: string; branches: { name: string } | null;
}

export default async function CustomOrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('custom_orders')
    .select('id, status, description, dimensions, material, color, reference_image_paths, quoted_price, deposit_percent, deposit_amount, quote_note, contact_phone, contact_preference, cancelled_reason, created_at, branches(name)')
    .eq('id', id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Row;
  const s = await getSettings();
  const short = o.id.slice(0, 8).toUpperCase();
  const msg = `السلام عليكم، طلب التفصيل رقم ${short}. أودّ الاستفسار/الاتفاق.`;
  const wa = waLink(s.contact.whatsapp, msg);
  const fb = messengerLink(s.contact.facebook);
  const open = o.status !== 'cancelled' && o.status !== 'delivered';

  return (
    <main className="container-page max-w-3xl space-y-4 py-8">
      {sp.ok && <p role="status" className="rounded-card border border-ok/40 bg-ok/10 p-3 text-sm text-ok">{sp.ok}</p>}
      {sp.error && <p role="alert" className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{sp.error}</p>}
      {sp.placed === '1' && <div className="card border-ok/40 bg-ok/10 p-4 text-sm"><p className="font-bold text-ok">تم استلام طلب التفصيل ✓</p><p>سنقوم بتسعيره ونتواصل معك.</p></div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">طلب تفصيل <bdi>{short}</bdi></h1>
        <span className={`badge ${CUSTOM_STATUS_CLASS[o.status]}`}>{CUSTOM_STATUS_LABEL[o.status]}</span>
      </div>

      {o.quoted_price != null && o.status !== 'cancelled' && (
        <section className="card space-y-1 border-accent/50 bg-accent/10 p-4 text-sm">
          <p className="text-base font-bold">السعر المقترح: <bdi className="text-primary">{formatPrice(o.quoted_price)}</bdi></p>
          {o.deposit_amount != null && <p>العربون ({o.deposit_percent}%): <bdi className="font-bold">{formatPrice(o.deposit_amount)}</bdi> — يُدفع قبل بدء التنفيذ.</p>}
          {o.quote_note && <p className="text-muted">{o.quote_note}</p>}
        </section>
      )}

      {open && (wa || fb) && (
        <section className="card space-y-3 p-4">
          <h2 className="font-bold">الاتفاق على السعر والعربون</h2>
          <p className="text-sm text-muted">تواصل معنا واذكر رقم الطلب <bdi className="font-bold text-fg">{short}</bdi>.</p>
          <div className="flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener" className={`btn ${o.contact_preference !== 'facebook' ? 'btn-primary' : 'btn-outline'}`}>تواصل عبر واتساب</a>}
            {fb && <a href={fb} target="_blank" rel="noopener" className={`btn ${o.contact_preference === 'facebook' ? 'btn-primary' : 'btn-outline'}`}>تواصل عبر ماسنجر</a>}
          </div>
        </section>
      )}

      <section className="card space-y-1 p-4 text-sm">
        <p className="whitespace-pre-line">{o.description}</p>
        {o.dimensions && <p><b>المقاس:</b> {o.dimensions}</p>}
        {o.material && <p><b>الخامة:</b> {o.material}</p>}
        {o.color && <p><b>اللون:</b> {o.color}</p>}
        {o.branches && <p><b>الفرع المفضّل:</b> {o.branches.name}</p>}
        {o.reference_image_paths.length > 0 && <p className="text-muted">الصور المرفقة: <bdi>{o.reference_image_paths.length}</bdi></p>}
        {o.cancelled_reason && <p className="text-danger"><b>سبب الإلغاء:</b> {o.cancelled_reason}</p>}
      </section>

      {customerCanCancelCustom(o.status) && (
        <form action={cancelCustomOrder} className="card flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="id" value={o.id} />
          <label className="min-w-0 flex-1"><span className="label">إلغاء الطلب (اختياري: السبب)</span><input name="reason" className="input" maxLength={300} /></label>
          <button className="btn btn-outline text-danger">إلغاء الطلب</button>
        </form>
      )}
      <Link href="/account" className="text-sm text-primary underline">كل طلباتي</Link>
    </main>
  );
}
