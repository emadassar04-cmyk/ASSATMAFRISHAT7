import { requireAdmin } from '@/lib/auth';
import { PROVIDERS, STATUS_LABEL, type Provider } from '@/lib/integrationSpecs';
import { Field, Flash, PageHeader, type SP } from '../_ui';
import { removeIntegration, saveIntegration, testIntegration } from './actions';

export const metadata = { title: 'الربط (واتساب/فيسبوك)' };

interface Row {
  provider: Provider; config: Record<string, string>; secret_names: string[];
  status: string; last_checked_at: string | null; last_error: string | null;
}
const BADGE: Record<string, string> = {
  connected: 'bg-ok/10 text-ok', error: 'bg-danger/10 text-danger', saved: 'bg-primary/10 text-primary', not_configured: 'bg-border text-muted',
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin('/dashboard/integrations');
  const { data } = await supabase.from('integrations').select('provider, config, secret_names, status, last_checked_at, last_error');
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title="الربط مع واتساب وفيسبوك" />
      <Flash sp={sp} />
      <p className="mb-4 text-sm text-muted">
        أدخل بيانات الربط هنا بدل ملفات البيئة. التوكنات تُحفظ مشفّرة (Supabase Vault) ولا تظهر بعد الحفظ؛ اترك حقل التوكن فارغاً لإبقاء المحفوظ.
        عند نجاح الاختبار يُفعَّل زر التواصل في الموقع تلقائياً.
      </p>
      <div className="space-y-4">
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => {
          const spec = PROVIDERS[p];
          const row = rows.find((r) => r.provider === p);
          const status = row?.status ?? 'not_configured';
          const saved = new Set(row?.secret_names ?? []);
          const info = [row?.config?.verified_name, row?.config?.display_phone_number, row?.config?.page_name].filter(Boolean).join(' — ');
          return (
            <form key={p} action={saveIntegration} className="card space-y-3 p-4">
              <input type="hidden" name="provider" value={p} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{spec.title}</h2>
                <span className={`badge ${BADGE[status]}`}>{STATUS_LABEL[status]}</span>
              </div>
              {info && <p className="text-sm text-muted">{info}</p>}
              {row?.last_error && <p role="alert" className="text-sm text-danger">آخر خطأ: {row.last_error}</p>}
              {row?.last_checked_at && <p className="text-xs text-muted">آخر اختبار: <bdi>{new Date(row.last_checked_at).toLocaleString('ar')}</bdi></p>}
              <p className="text-xs text-muted">{spec.help} <a className="text-primary underline" href={spec.helpUrl} target="_blank" rel="noopener">Meta for Developers</a></p>
              <div className="grid gap-3 sm:grid-cols-2">
                {spec.fields.map((f) => (
                  <Field key={f.name} label={f.label}>
                    <input name={f.name} dir="ltr" className="input" autoComplete="off" spellCheck={false}
                      type={f.secret ? 'password' : 'text'}
                      defaultValue={f.secret ? '' : row?.config?.[f.name] ?? ''}
                      placeholder={f.secret && saved.has(f.name) ? '•••••••• محفوظ' : ''} />
                    <span className="mt-1 block text-xs text-muted">{f.hint}</span>
                  </Field>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary">حفظ</button>
                <button className="btn btn-outline" formAction={testIntegration}>اختبار الاتصال</button>
                {status !== 'not_configured' && (
                  <button className="btn btn-outline text-danger" formAction={removeIntegration}>فصل وحذف الأسرار</button>
                )}
              </div>
            </form>
          );
        })}
      </div>
    </>
  );
}
