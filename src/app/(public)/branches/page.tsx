import type { Metadata } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { WEEKDAYS, hhmm, httpUrl, waLink } from '@/lib/format';
import type { Branch, BranchHour } from '@/types';

export const metadata: Metadata = { title: 'الفروع' };
export const revalidate = 60;

export default async function BranchesPage() {
  const sb = createPublicClient();
  const [{ data: branches }, { data: hours }, { data: holidays }] = await Promise.all([
    sb.from('branches').select('*').eq('is_active', true).order('sort_order'),
    sb.from('branch_hours').select('*').order('weekday'),
    sb.from('branch_holidays').select('*').gte('on_date', new Date().toISOString().slice(0, 10)).order('on_date'),
  ]);
  return (
    <div className="container-page space-y-6 py-6">
      <h1 className="text-2xl font-bold">فروعنا</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {(branches as Branch[] | null)?.map((b) => {
          const bh = ((hours ?? []) as BranchHour[]).filter((h) => h.branch_id === b.id);
          const hol = (holidays ?? []).filter((h: { branch_id: string | null }) => h.branch_id === b.id || h.branch_id === null);
          const map = httpUrl(b.map_url ?? undefined);
          const wa = waLink(b.whatsapp ?? undefined);
          const tel = b.phone && /\d{7}/.test(b.phone) ? `tel:${b.phone.replace(/[^\d+]/g, '')}` : null;
          return (
            <article key={b.id} className="card space-y-3 p-5">
              <h2 className="text-lg font-bold text-primary">{b.name}</h2>
              {b.address && <p className="text-sm">📍 {b.address}</p>}
              {b.phone && <p className="text-sm" dir="ltr" style={{ textAlign: 'right' }}>☎ {b.phone}</p>}
              <div>
                <p className="label">ساعات الدوام</p>
                <ul className="space-y-0.5 text-sm">
                  {bh.map((h) => <li key={h.id}>{WEEKDAYS[h.weekday]}: <bdi>{hhmm(h.opens_at)} - {hhmm(h.closes_at)}</bdi></li>)}
                  {!bh.length && <li className="text-muted">[ساعات الدوام]</li>}
                </ul>
              </div>
              {!!hol.length && (
                <p className="text-xs text-muted">
                  إغلاقات قادمة: {hol.map((h: { on_date: string; reason: string | null }) => `${h.on_date}${h.reason ? ` (${h.reason})` : ''}`).join('، ')}
                </p>
              )}
              {map && /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|openstreetmap\.org/.test(map) && map.includes('/embed') ? (
                <iframe src={map} title={`خريطة ${b.name}`} loading="lazy" className="h-56 w-full rounded-card border-0" referrerPolicy="no-referrer" />
              ) : null}
              <div className="flex flex-wrap gap-2">
                {map && <a href={map} target="_blank" rel="noopener" className="btn btn-outline btn-sm">فتح الخريطة</a>}
                {tel && <a href={tel} className="btn btn-outline btn-sm">اتصال</a>}
                {wa && <a href={wa} target="_blank" rel="noopener" className="btn btn-outline btn-sm">واتساب</a>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
