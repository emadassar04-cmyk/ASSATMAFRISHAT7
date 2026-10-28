'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useCart } from '@/lib/cart';
import { cartPayload, cartSubtotal } from '@/lib/cartCore';
import { formatPrice } from '@/lib/format';
import { placeOrder, type CheckoutState } from './actions';

interface Props {
  branches: { id: string; name: string; address: string | null }[];
  zones: { id: string; name: string; fee: number; fee_on_agreement: boolean }[];
  defaultPhone: string; hasWhatsapp: boolean; hasFacebook: boolean; policySummary: string;
}

export function CheckoutForm({ branches, zones, defaultPhone, hasWhatsapp, hasFacebook, policySummary }: Props) {
  const cart = useCart();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');

  if (!cart.length) {
    return (
      <div className="card space-y-3 p-8 text-center">
        <p className="text-muted">سلتك فارغة.</p>
        <Link href="/products" className="btn btn-primary">تصفّح المنتجات</Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cart" value={JSON.stringify(cartPayload(cart))} />

      <section className="card space-y-2 p-4">
        <h2 className="font-bold">طلبك</h2>
        <ul className="divide-y divide-border text-sm">
          {cart.map((l) => (
            <li key={l.variantId} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">{l.name}{l.options && <span className="text-muted"> — {l.options}</span>} × <bdi>{l.qty}</bdi></span>
              <bdi className="shrink-0">{formatPrice(l.price * l.qty)}</bdi>
            </li>
          ))}
        </ul>
        <p className="flex justify-between font-bold"><span>المجموع</span><bdi className="text-primary">{formatPrice(cartSubtotal(cart))}</bdi></p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">الاستلام</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="fulfillment" value="pickup" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> استلام من الفرع</label>
          {zones.length > 0 && (
            <label className="flex items-center gap-1.5"><input type="radio" name="fulfillment" value="delivery" checked={fulfillment === 'delivery'} onChange={() => setFulfillment('delivery')} /> توصيل</label>
          )}
        </div>
        <label className="block">
          <span className="label">{fulfillment === 'delivery' ? 'الفرع الذي يجهّز الطلب' : 'فرع الاستلام'}</span>
          <select name="branch_id" className="input" required defaultValue="">
            <option value="" disabled>اختر الفرع</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.address ? ` — ${b.address}` : ''}</option>)}
          </select>
        </label>
        {fulfillment === 'delivery' && (
          <>
            <label className="block">
              <span className="label">منطقة التوصيل</span>
              <select name="zone_id" className="input" required defaultValue="">
                <option value="" disabled>اختر المنطقة</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.fee_on_agreement ? ' (الرسوم بالاتفاق)' : ` (${formatPrice(z.fee)})`}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">العنوان بالتفصيل</span>
              <textarea name="address" className="input" rows={2} maxLength={300} required minLength={5} />
            </label>
          </>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">التواصل والاتفاق على الدفع والتوصيل</h2>
        <p className="text-sm text-muted">بعد تقديم الطلب نتواصل معك عبر واتساب أو فيسبوك للاتفاق على طريقة الدفع{fulfillment === 'delivery' ? ' ورسوم التوصيل' : ''}.</p>
        <label className="block">
          <span className="label">رقم الجوال</span>
          <input name="phone" className="input" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" defaultValue={defaultPhone} required />
        </label>
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="label">أفضّل التواصل عبر</legend>
          {hasWhatsapp && <label className="flex items-center gap-1.5"><input type="radio" name="contact" value="whatsapp" defaultChecked /> واتساب</label>}
          {hasFacebook && <label className="flex items-center gap-1.5"><input type="radio" name="contact" value="facebook" defaultChecked={!hasWhatsapp} /> فيسبوك (ماسنجر)</label>}
          {!hasWhatsapp && !hasFacebook && <span className="text-muted">سنتواصل معك على جوالك.</span>}
        </fieldset>
        <label className="block">
          <span className="label">ملاحظات (اختياري)</span>
          <textarea name="note" className="input" rows={2} maxLength={500} />
        </label>
      </section>

      <section className="card space-y-2 border-accent/50 bg-accent/10 p-4 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="policy" required className="mt-1 size-4 accent-[var(--primary)]" />
          <span>أوافق على <Link href="/policies/exchange" target="_blank" className="text-primary underline">سياسة الاستبدال</Link>: {policySummary}</span>
        </label>
      </section>

      {state.error && <p role="alert" className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? 'جارٍ تقديم الطلب...' : 'تقديم الطلب'}</button>
    </form>
  );
}
