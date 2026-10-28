import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { CHANNEL_LABEL, CONV_STATUS_CLASS, CONV_STATUS_LABEL, type ConvStatus } from '@/lib/conversations';
import { Flash, PageHeader, type SP } from '../../_ui';
import { convAction, sendReply } from '../actions';

export const metadata = { title: 'محادثة' };

interface Conv {
  id: string; status: ConvStatus; channel: string; handoff_reason: string | null; last_customer_message_at: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
}
interface Msg { id: string; sender: 'customer' | 'bot' | 'staff' | 'system'; body: string | null; created_at: string }
const SENDER: Record<Msg['sender'], string> = { customer: 'الزبون', bot: 'البوت', staff: 'موظف', system: 'النظام' };

/** نافذة واتساب 24 ساعة: الرد الحر خارجها قد يُرفض من المنصة (قوالب لاحقاً) */
const windowClosed = (channel: string, last: string | null) =>
  channel === 'whatsapp' && (!last || Date.now() - new Date(last).getTime() > 24 * 3600 * 1000);

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireStaff(`/dashboard/inbox/${id}`);
  const { data } = await supabase.from('conversations')
    .select('id, status, channel, handoff_reason, last_customer_message_at, customers(full_name, phone)').eq('id', id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as Conv;
  const { data: m } = await supabase.from('messages').select('id, sender, body, created_at').eq('conversation_id', id)
    .order('created_at', { ascending: false }).limit(100);
  const msgs = ((m ?? []) as Msg[]).reverse();
  const waClosed = windowClosed(c.channel, c.last_customer_message_at);
  const btn = (act: string, label: string) => (
    <form action={convAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="act" value={act} /><button className="btn btn-outline btn-sm">{label}</button></form>
  );

  return (
    <>
      <PageHeader title={c.customers?.full_name || 'محادثة'}>
        <Link href="/dashboard/inbox" className="btn btn-outline btn-sm">← الصندوق</Link>
      </PageHeader>
      <Flash sp={sp} />
      <div className="card mb-3 flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <span>{CHANNEL_LABEL[c.channel] ?? c.channel} · <bdi>{c.customers?.phone ?? 'بلا رقم'}</bdi>{c.handoff_reason && <> · {c.handoff_reason}</>}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className={`badge ${CONV_STATUS_CLASS[c.status]}`}>{CONV_STATUS_LABEL[c.status]}</span>
          {c.status !== 'closed' && <>{btn('assign', 'استلام')}{btn('to_bot', 'إعادة للبوت')}{btn('close', 'إغلاق')}</>}
        </span>
      </div>
      <ul className="card mb-3 max-h-[60dvh] space-y-2 overflow-y-auto p-3 text-sm" aria-label="الرسائل">
        {msgs.length ? msgs.map((x) => (
          <li key={x.id} className={`max-w-[85%] rounded-card p-2 ${x.sender === 'customer' ? 'bg-border/50' : 'ms-auto bg-primary/10'}`}>
            <p className="text-xs text-muted">{SENDER[x.sender]} · <time dateTime={x.created_at}>{new Date(x.created_at).toLocaleString('ar-EG', { timeZone: 'Asia/Gaza', dateStyle: 'short', timeStyle: 'short' })}</time></p>
            <p className="whitespace-pre-line">{x.body}</p>
          </li>
        )) : <li className="text-center text-muted">لا رسائل بعد.</li>}
      </ul>
      {c.status !== 'closed' && (
        <form action={sendReply} className="card space-y-2 p-3">
          <input type="hidden" name="id" value={id} />
          {waClosed && <p className="text-xs text-danger">مرّت أكثر من 24 ساعة على آخر رسالة للزبون في واتساب؛ قد ترفض المنصة الرد الحر.</p>}
          <textarea name="body" required maxLength={4000} rows={3} className="input" placeholder="اكتب ردك…" aria-label="نص الرد" />
          <button className="btn btn-primary">إرسال</button>
        </form>
      )}
    </>
  );
}
