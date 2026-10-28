'use client';
import { useActionState } from 'react';
import { importProducts, type ImportReport } from './actions';

const INIT: ImportReport = { ok: false, created: 0, updated: 0, variants: 0, errors: [] };

export function ImportForm() {
  const [report, action, pending] = useActionState(importProducts, INIT);
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,.xlsx" className="input" required />
      <button className="btn btn-primary" disabled={pending}>{pending ? 'جارٍ الاستيراد...' : 'استيراد'}</button>
      {report.message && <p role="alert" className="text-sm text-danger">{report.message}</p>}
      {report.ok && (
        <div role="status" className="rounded-card border border-ok/40 bg-ok/10 p-3 text-sm">
          تم: {report.created} منتج جديد، {report.updated} محدَّث، {report.variants} خيار.
        </div>
      )}
      {!!report.errors.length && (
        <div role="alert" className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="mb-1 font-medium">أخطاء ({report.errors.length}):</p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {report.errors.map((e, i) => <li key={i}>الصف {e.row}: {e.message}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
