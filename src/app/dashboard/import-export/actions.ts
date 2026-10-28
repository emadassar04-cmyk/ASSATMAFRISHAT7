'use server';
import ExcelJS from 'exceljs';
import { requireStaff } from '@/lib/auth';
import { slugify } from '@/lib/format';
import { parseBool, parseCsv, parseOptions, parseStock, rowsToRecords, STOCK_PREFIX, type ImportRecord } from '@/lib/importExport';
import { refreshStorefront } from '../actions-util';

export interface ImportReport { ok: boolean; message?: string; created: number; updated: number; variants: number; errors: { row: number; message: string }[] }
const EMPTY: ImportReport = { ok: false, created: 0, updated: 0, variants: 0, errors: [] };
const MAX_ROWS = 500;

async function readRows(f: File): Promise<string[][]> {
  const name = f.name.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(await f.text());
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await f.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) =>
        v == null ? '' : typeof v === 'object' && 'text' in (v as object) ? String((v as { text: string }).text) : String(v));
      rows.push(vals);
    });
    return rows;
  }
  throw new Error('صيغة الملف غير مدعومة (CSV أو XLSX فقط)');
}

/** استيراد المنتجات: صف لكل Variant، التحديث بالـ slug والـ SKU، وتقرير أخطاء صفّي */
export async function importProducts(_prev: ImportReport, formData: FormData): Promise<ImportReport> {
  const { supabase, userId } = await requireStaff('/dashboard/import-export');
  const f = formData.get('file');
  if (!(f instanceof File) || !f.size) return { ...EMPTY, message: 'اختر ملفاً' };
  if (f.size > 5 * 1024 * 1024) return { ...EMPTY, message: 'الملف أكبر من 5MB' };

  let rows: string[][];
  try { rows = await readRows(f); } catch (e) { return { ...EMPTY, message: e instanceof Error ? e.message : 'تعذّرت قراءة الملف' }; }
  const { records, stockCols, missing } = rowsToRecords(rows);
  if (missing.length) return { ...EMPTY, message: `أعمدة ناقصة: ${missing.join('، ')}` };
  if (records.length > MAX_ROWS) return { ...EMPTY, message: `الحد الأقصى ${MAX_ROWS} صف في المرة الواحدة` };

  const [{ data: branches }, { data: cats }, { data: types }, { data: values }] = await Promise.all([
    supabase.from('branches').select('id, slug'),
    supabase.from('categories').select('id, name, slug'),
    supabase.from('option_types').select('id, name'),
    supabase.from('option_values').select('id, type_id, value'),
  ]);
  const branchBySlug = new Map((branches ?? []).map((b: { id: string; slug: string }) => [b.slug, b.id]));
  const catIdx = new Map<string, string>();
  (cats ?? []).forEach((c: { id: string; name: string; slug: string }) => { catIdx.set(c.name, c.id); catIdx.set(c.slug, c.id); });
  const typeIdx = new Map((types ?? []).map((t: { id: string; name: string }) => [t.name, t.id]));
  const valueIdx = new Map((values ?? []).map((v: { id: string; type_id: string; value: string }) => [`${v.type_id}|${v.value}`, v.id]));

  async function optionValueId(typeName: string, value: string): Promise<string> {
    let tid = typeIdx.get(typeName);
    if (!tid) {
      const { data, error } = await supabase.from('option_types').insert({ name: typeName }).select('id').single();
      if (error || !data) throw new Error(`تعذّر إنشاء الخاصية ${typeName}`);
      tid = data.id as string; typeIdx.set(typeName, tid);
    }
    const key = `${tid}|${value}`;
    let vid = valueIdx.get(key);
    if (!vid) {
      const { data, error } = await supabase.from('option_values').insert({ type_id: tid, value }).select('id').single();
      if (error || !data) throw new Error(`تعذّر إنشاء القيمة ${value}`);
      vid = data.id as string; valueIdx.set(key, vid);
    }
    return vid;
  }

  const report: ImportReport = { ok: true, created: 0, updated: 0, variants: 0, errors: [] };
  const groups = new Map<string, { first: number; recs: { n: number; r: ImportRecord }[] }>();
  records.forEach((r, i) => {
    const key = r.product_slug || (r.name ? slugify(r.name) : '');
    if (!key) { report.errors.push({ row: i + 2, message: 'اسم المنتج مفقود' }); return; }
    const g = groups.get(key) ?? { first: i + 2, recs: [] };
    g.recs.push({ n: i + 2, r }); groups.set(key, g);
  });

  for (const [slug, g] of groups) {
    const head = g.recs[0].r;
    try {
      if (!head.name) throw new Error('اسم المنتج مفقود');
      const price = Number(head.base_price || g.recs.find((x) => x.r.variant_price)?.r.variant_price || 0);
      if (!Number.isFinite(price) || price < 0) throw new Error('السعر الأساسي غير صالح');
      const fields = {
        name: head.name, description: head.description || null, base_price: price,
        category_id: head.category ? catIdx.get(head.category) ?? null : null,
        is_visible: parseBool(head.visible, true), is_featured: parseBool(head.featured, false),
      };
      const { data: existing } = await supabase.from('products').select('id').eq('slug', slug).maybeSingle();
      let pid: string;
      if (existing) {
        const { error } = await supabase.from('products').update(fields).eq('id', existing.id);
        if (error) throw new Error('تعذّر تحديث المنتج');
        pid = existing.id; report.updated++;
      } else {
        const { data, error } = await supabase.from('products').insert({ ...fields, slug, created_by: userId }).select('id').single();
        if (error || !data) throw new Error('تعذّر إنشاء المنتج');
        pid = data.id; report.created++;
      }

      for (const { n, r } of g.recs) {
        if (!r.variant_price) continue;
        try {
          const vprice = Number(r.variant_price);
          if (!Number.isFinite(vprice) || vprice < 0) throw new Error('سعر الخيار غير صالح');
          const optIds = await Promise.all(parseOptions(r.options ?? '').map(([t, v]) => optionValueId(t, v)));
          const vrow = {
            product_id: pid, sku: r.sku || null, price: vprice,
            compare_at_price: r.compare_at_price ? Number(r.compare_at_price) : null, is_active: true,
          };
          let vid: string | undefined;
          if (r.sku) {
            const { data } = await supabase.from('product_variants').select('id, product_id').eq('sku', r.sku).maybeSingle();
            if (data && data.product_id !== pid) throw new Error(`SKU ${r.sku} مستخدم لمنتج آخر`);
            vid = data?.id;
          } else if (optIds.length) {
            const { data } = await supabase.from('product_variants').select('id, variant_options(value_id)').eq('product_id', pid);
            vid = (data ?? []).find((v: { id: string; variant_options: { value_id: string }[] }) =>
              v.variant_options.length === optIds.length && optIds.every((o) => v.variant_options.some((x) => x.value_id === o)))?.id;
          }
          if (vid) {
            const { error } = await supabase.from('product_variants').update(vrow).eq('id', vid);
            if (error) throw new Error('تعذّر تحديث الخيار');
          } else {
            const { data, error } = await supabase.from('product_variants').insert(vrow).select('id').single();
            if (error || !data) throw new Error('تعذّر إنشاء الخيار');
            vid = data.id;
          }
          await supabase.from('variant_options').delete().eq('variant_id', vid);
          if (optIds.length) await supabase.from('variant_options').insert(optIds.map((value_id) => ({ variant_id: vid, value_id })));

          const stock = stockCols.flatMap((c) => {
            const bid = branchBySlug.get(c.slice(STOCK_PREFIX.length));
            const s = parseStock(r[c] ?? '');
            return bid && s ? [{ variant_id: vid, branch_id: bid, quantity: s.quantity, status: s.mto ? 'made_to_order' : 'available' }] : [];
          });
          if (stock.length) await supabase.from('branch_stock').upsert(stock, { onConflict: 'variant_id,branch_id' });
          report.variants++;
        } catch (e) { report.errors.push({ row: n, message: e instanceof Error ? e.message : 'خطأ' }); }
      }
    } catch (e) { report.errors.push({ row: g.first, message: e instanceof Error ? e.message : 'خطأ' }); }
  }
  refreshStorefront();
  return report;
}
