import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BASE_COLS, formatOptions, STOCK_PREFIX, toCsv } from '@/lib/importExport';

/** تصدير المنتجات (CSV/XLSX) — للمشرف والإداري فقط */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();
  if (!me?.is_active || !['moderator', 'admin'].includes(me.role)) return new NextResponse('Forbidden', { status: 403 });

  // الصفحات بحجم 1000 (حد PostgREST) حتى لا يُقتطع التصدير بصمت
  const products: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products')
      .select('slug, name, description, base_price, is_visible, is_featured, categories(name), product_variants(sku, price, compare_at_price, variant_options(value_id), branch_stock(branch_id, quantity, status))')
      .order('created_at').order('id').range(from, from + 999);
    if (error) return new NextResponse('Export failed', { status: 500 });
    products.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const [{ data: branches }, { data: ovs }, { data: ots }] = await Promise.all([
    supabase.from('branches').select('id, slug').order('sort_order'),
    supabase.from('option_values').select('id, value, type_id'),
    supabase.from('option_types').select('id, name'),
  ]);
  const typeName = new Map((ots ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const valInfo = new Map((ovs ?? []).map((v: { id: string; value: string; type_id: string }) => [v.id, [typeName.get(v.type_id) ?? '', v.value] as [string, string]]));
  const bl = (branches ?? []) as { id: string; slug: string }[];

  const header = [...BASE_COLS, ...bl.map((b) => `${STOCK_PREFIX}${b.slug}`)] as string[];
  const rows: string[][] = [header];
  type V = { sku: string | null; price: number; compare_at_price: number | null; variant_options: { value_id: string }[]; branch_stock: { branch_id: string; quantity: number; status: string }[] };
  type P = { slug: string; name: string; description: string | null; base_price: number; is_visible: boolean; is_featured: boolean; categories: { name: string } | null; product_variants: V[] };
  for (const p of products as P[]) {
    const base = [p.slug, p.name, p.categories?.name ?? '', p.description ?? '', String(p.base_price), p.is_visible ? '1' : '0', p.is_featured ? '1' : '0'];
    const vs: (V | null)[] = p.product_variants.length ? p.product_variants : [null];
    for (const v of vs) {
      rows.push([
        ...base,
        v?.sku ?? '', v ? String(v.price) : '', v?.compare_at_price != null ? String(v.compare_at_price) : '',
        v ? formatOptions(v.variant_options.map((o) => valInfo.get(o.value_id)).filter((x): x is [string, string] => !!x)) : '',
        ...bl.map((b) => {
          const s = v?.branch_stock.find((x) => x.branch_id === b.id);
          return s ? (s.status === 'made_to_order' ? 'حسب الطلب' : String(s.quantity)) : '';
        }),
      ]);
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (new URL(req.url).searchParams.get('format') === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('products', { views: [{ rightToLeft: true }] });
    rows.forEach((r) => ws.addRow(r.map((c) => (/^[=+@]/.test(c) ? `'${c}` : c))));
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="products-${stamp}.xlsx"`,
      },
    });
  }
  return new NextResponse(toCsv(rows), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="products-${stamp}.csv"` },
  });
}
