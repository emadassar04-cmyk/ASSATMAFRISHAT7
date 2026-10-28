'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { createCustomOrder, type CustomState } from './actions';

interface Props {
  branches: { id: string; name: string }[]; defaultPhone: string; hasWhatsapp: boolean; hasFacebook: boolean;
  deposit: number; policySummary: string;
}

export function CustomOrderForm({ branches, defaultPhone, hasWhatsapp, hasFacebook, deposit, policySummary }: Props) {
  const [state, action, pending] = useActionState<CustomState, FormData>(createCustomOrder, {});
  return (
    <form action={action} className="space-y-4">
      <section className="card space-y-3 p-4">
        <label className="block">
          <span className="label">وصف القطعة المطلوبة</span>
          <textarea name="description" className="input" rows={4} minLength={10} maxLength={2000} required placeholder="مثال: كنب ركنة على شكل L بمقاس 3×2.5 متر…" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">المقاس</span><input name="dimensions" className="input" maxLength={120} /></label>
          <label className="block"><span className="label">الخامة</span><input name="material" className="input" maxLength={120} /></label>
          <label className="block"><span className="label">اللون</span><input name="color" className="input" maxLength={120} /></label>
        </div>
        <label className="block">
          <span className="label">صور مرجعية (حتى 3، JPG أو PNG أو WebP، 5MB لكل صورة)</span>
          <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="input" />
        </label>
        <label className="block">
          <span className="label">الفرع المفضّل للتسليم (اختياري)</span>
          <select name="branch_id" className="input" defaultValue="">
            <option value="">لا تفضيل</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">التواصل</h2>
        <label className="block"><span className="label">رقم الجوال</span><input name="phone" className="input" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" defaultValue={defaultPhone} required /></label>
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="label">أفضّل التواصل عبر</legend>
          {hasWhatsapp && <label className="flex items-center gap-1.5"><input type="radio" name="contact" value="whatsapp" defaultChecked /> واتساب</label>}
          {hasFacebook && <label className="flex items-center gap-1.5"><input type="radio" name="contact" value="facebook" defaultChecked={!hasWhatsapp} /> فيسبوك (ماسنجر)</label>}
          {!hasWhatsapp && !hasFacebook && <span className="text-muted">سنتواصل معك على جوالك.</span>}
        </fieldset>
        {deposit > 0 && <p className="text-xs text-muted">يُطلب عربون بنسبة <bdi>{deposit}%</bdi> من السعر المتفق عليه قبل بدء التنفيذ، ونتفق على طريقة دفعه عبر واتساب أو فيسبوك.</p>}
      </section>

      <section className="card space-y-2 border-accent/50 bg-accent/10 p-4 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="policy" required className="mt-1 size-4 accent-[var(--primary)]" />
          <span>أوافق على <Link href="/policies/custom-orders" target="_blank" className="text-primary underline">شروط الطلبات المفصّلة</Link>: {policySummary}</span>
        </label>
      </section>

      {state.error && <p role="alert" className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</button>
    </form>
  );
}
