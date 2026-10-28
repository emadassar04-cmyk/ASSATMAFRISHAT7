import { requireStaff } from '@/lib/auth';
import { BASE_COLS } from '@/lib/importExport';
import { PageHeader } from '../_ui';
import { ImportForm } from './ImportForm';

export const metadata = { title: 'استيراد وتصدير' };

export default async function ImportExportPage() {
  const { supabase } = await requireStaff('/dashboard/import-export');
  const { data: branches } = await supabase.from('branches').select('slug').order('sort_order');
  const cols = [...BASE_COLS, ...(branches ?? []).map((b: { slug: string }) => `stock:${b.slug}`)];
  return (
    <>
      <PageHeader title="استيراد وتصدير المنتجات" />
      <section className="card mb-5 space-y-3 p-4">
        <h2 className="font-bold">تصدير</h2>
        <p className="text-sm text-muted">يُصدَّر صف لكل خيار (Variant) بنفس صيغة الاستيراد.</p>
        <div className="flex gap-2">
          <a className="btn btn-outline" href="/api/dashboard/products-export?format=csv" download>CSV</a>
          <a className="btn btn-outline" href="/api/dashboard/products-export?format=xlsx" download>Excel</a>
        </div>
      </section>
      <section className="card mb-5 space-y-3 p-4">
        <h2 className="font-bold">استيراد (CSV أو Excel)</h2>
        <ImportForm />
      </section>
      <section className="card space-y-2 p-4 text-sm">
        <h2 className="font-bold">صيغة الملف</h2>
        <p className="text-muted">الصف الأول رؤوس الأعمدة. الحد الأقصى 500 صف. التحديث يتم بالـ <code>product_slug</code> وبالـ <code>sku</code>.</p>
        <p dir="ltr" className="break-words rounded bg-border/40 p-2 text-xs">{cols.join(', ')}</p>
        <ul className="list-disc space-y-1 ps-5 text-muted">
          <li><code>options</code>: مثل <bdi>اللون=بيج;الخامة=قطن</bdi> (تُنشأ الخصائص الناقصة تلقائياً).</li>
          <li><code>stock:&lt;branch-slug&gt;</code>: الكمية، أو <bdi>حسب الطلب</bdi>.</li>
          <li><code>visible</code> / <code>featured</code>: نعم أو لا (1/0).</li>
          <li><code>category</code>: اسم القسم أو الـ slug.</li>
        </ul>
      </section>
    </>
  );
}
