import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { CHANNEL_LABEL, CONV_STATUS_CLASS, CONV_STATUS_LABEL, isConvStatus, type ConvStatus } from '@/lib/conversations';
import { Flash, PageHeader, type SP, first } from '../_ui';

export const metadata = { title: 'صندوق المحادثات' };

interface Row {
  id: string; status: ConvStatus; channel: string; handoff_reason: string | null; waiting_since: string | null; last_message_at: string;
  customers: { full_name: string | null; phone: string | null } | null;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireStaff('/dashboard/inbox');
  const status = first(sp.status);
  // الافتراضي: ما يحتاج موظفاً (بانتظار/مع موظف)؛ المغلقة والبوت بالتصفية
  let query = supabase.from('conversations')
    .select('id, status, channel, handoff_reason, waiting_since, last_message_at, customers(full_name, phone)')
    .order('last_message_at', { ascending: false }).limit(100);
  query = isConvStatus(status) ? query.eq('status', status) : status === 'all' ? query : query.in('status', ['waiting', 'human']);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageHeader title="صندوق المحادثات" />
      <Flash sp={sp} />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
        <select name="status" defaultValue={status} className="input" aria-label="الحالة">
          <option value="">تحتاج موظفاً (بانتظار/مع موظف)</option>
          <option value="all">الكل</option>
          {Object.entries(CONV_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-outline">تصفية</button>
      </form>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/inbox/${c.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:border-primary">
                <span className="min-w-0">
                  <b>{c.customers?.full_name || 'زبون'}</b> <bdi className="text-muted">{c.customers?.phone ?? ''}</bdi>
                  {c.handoff_reason && <span className="line-clamp-1 text-muted">{c.handoff_reason}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                  <time className="text-xs text-muted" dateTime={c.last_message_at}>{new Date(c.last_message_at).toLocaleString('ar-EG', { timeZone: 'Asia/Gaza', dateStyle: 'short', timeStyle: 'short' })}</time>
                  <span className={`badge ${CONV_STATUS_CLASS[c.status]}`}>{CONV_STATUS_LABEL[c.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="card p-6 text-center text-muted">لا توجد محادثات.</p>}
    </>
  );
}
