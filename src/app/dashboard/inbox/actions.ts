'use server';
import { requireStaff } from '@/lib/auth';
import { convErrorMessage } from '@/lib/conversations';
import { go, isUuid, str } from '../actions-util';

const back = (id: string) => `/dashboard/inbox/${id}`;

/** الدوال في القاعدة تتحقق من الدور (مشرف/إداري مع 2FA) وتسجّل الرد وحدث الإرسال في Outbox */
export async function sendReply(formData: FormData) {
  const id = str(formData, 'id');
  const { supabase } = await requireStaff(back(id));
  if (!isUuid(id)) go('/dashboard/inbox', { error: 'بيانات غير صالحة' });
  const { error } = await supabase.rpc('staff_reply', { p_conv: id, p_body: str(formData, 'body') });
  if (error) go(back(id), { error: convErrorMessage(error.message) });
  go(back(id), { ok: 'تم تسجيل الرد وإرساله للقناة' });
}

const ACTIONS = {
  assign: { fn: 'assign_conversation', ok: 'تم استلام المحادثة' },
  to_bot: { fn: 'return_to_bot', ok: 'أُعيدت المحادثة للبوت' },
  close: { fn: 'close_conversation', ok: 'أُغلقت المحادثة' },
} as const;

export async function convAction(formData: FormData) {
  const id = str(formData, 'id'); const act = str(formData, 'act');
  const { supabase } = await requireStaff(back(id));
  if (!isUuid(id) || !(act in ACTIONS)) go('/dashboard/inbox', { error: 'بيانات غير صالحة' });
  const a = ACTIONS[act as keyof typeof ACTIONS];
  const { error } = await supabase.rpc(a.fn, { p_conv: id });
  if (error) go(back(id), { error: convErrorMessage(error.message) });
  go(back(id), { ok: a.ok });
}
