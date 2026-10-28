// حالات المحادثات وقنواتها (تسميات عربية) وترجمة أخطاء دوال الموظف
export type ConvStatus = 'bot' | 'human' | 'waiting' | 'closed';
export const CONV_STATUS_LABEL: Record<ConvStatus, string> = {
  bot: 'عند البوت', human: 'مع موظف', waiting: 'بانتظار موظف', closed: 'مغلقة',
};
export const CONV_STATUS_CLASS: Record<ConvStatus, string> = {
  bot: 'bg-primary/10 text-primary', human: 'bg-ok/10 text-ok', waiting: 'bg-accent/20 text-fg', closed: 'bg-border text-muted',
};
export const CHANNEL_LABEL: Record<string, string> = { web: 'الموقع', facebook: 'فيسبوك', whatsapp: 'واتساب', telegram: 'تلجرام' };
export const isConvStatus = (s: string): s is ConvStatus => s in CONV_STATUS_LABEL;

export function convErrorMessage(m: string): string {
  if (m.includes('not_allowed')) return 'غير مصرّح';
  if (m.includes('invalid_message')) return 'الرسالة فارغة أو أطول من 4000 حرف';
  if (m.includes('conversation_closed')) return 'المحادثة مغلقة';
  if (m.includes('conversation_not_found')) return 'المحادثة غير موجودة';
  return 'تعذّر تنفيذ العملية';
}
