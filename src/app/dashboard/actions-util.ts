import 'server-only';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

/** إعادة توجيه مع رسالة (تظهر عبر <Flash/>) */
export function go(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URLSearchParams();
  if (msg.ok) u.set('ok', msg.ok);
  if (msg.error) u.set('error', msg.error);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${u}`);
}

/** تحديث كاش الواجهة العامة بعد أي تعديل على المحتوى */
export function refreshStorefront() {
  revalidatePath('/', 'layout');
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
export const strOrNull = (f: FormData, k: string) => str(f, k) || null;
export const bool = (f: FormData, k: string) => f.get(k) === 'on';
export const numOr = (f: FormData, k: string, d = 0) => {
  const v = Number(str(f, k));
  return Number.isFinite(v) && str(f, k) !== '' ? v : d;
};
export const file = (f: FormData, k: string): File | null => {
  const v = f.get(k);
  return v instanceof File && v.size > 0 ? v : null;
};
export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
