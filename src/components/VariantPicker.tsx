'use client';
import { useMemo, useState } from 'react';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL, formatPrice } from '@/lib/format';
import type { Availability } from '@/types';

interface VariantVM { id: string; sku: string | null; price: number; compare_at: number | null; valueIds: string[] }
interface Group { typeId: string; typeName: string; values: { id: string; label: string; swatch: string | null }[] }
interface Stock { variant_id: string; branch_id: string; status: Availability }

/** اختيار الخصائص (لون/خامة/مقاس): يعرض السعر حسب الخيار والتوفر في كل فرع */
export function VariantPicker({ groups, variants, stock, branches }: {
  groups: Group[]; variants: VariantVM[]; stock: Stock[]; branches: { id: string; name: string }[];
}) {
  const initial = useMemo(() => {
    const first = variants[0];
    const sel: Record<string, string> = {};
    if (first) for (const g of groups) {
      const v = g.values.find((x) => first.valueIds.includes(x.id));
      if (v) sel[g.typeId] = v.id;
    }
    return sel;
  }, [groups, variants]);
  const [sel, setSel] = useState<Record<string, string>>(initial);

  const chosen = Object.values(sel);
  const variant = variants.find((v) => chosen.every((id) => v.valueIds.includes(id)) &&
    v.valueIds.length >= chosen.length) ?? null;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <fieldset key={g.typeId}>
          <legend className="label">{g.typeName}</legend>
          <div className="flex flex-wrap gap-2">
            {g.values.map((v) => {
              const active = sel[g.typeId] === v.id;
              return (
                <button key={v.id} type="button" aria-pressed={active}
                  onClick={() => setSel((s) => ({ ...s, [g.typeId]: v.id }))}
                  className={`btn btn-sm gap-1.5 ${active ? 'btn-primary' : 'btn-outline'}`}>
                  {v.swatch && /^#[0-9a-fA-F]{3,8}$/.test(v.swatch) &&
                    <span className="size-3.5 rounded-full border border-border" style={{ background: v.swatch }} />}
                  {v.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="card space-y-3 p-4">
        {variant ? (
          <>
            <p className="text-2xl font-bold text-primary">
              <bdi>{formatPrice(variant.price)}</bdi>
              {variant.compare_at && variant.compare_at > variant.price &&
                <s className="ms-2 text-sm font-normal text-muted"><bdi>{formatPrice(variant.compare_at)}</bdi></s>}
            </p>
            <ul className="space-y-1.5 text-sm">
              {branches.map((b) => {
                const s = stock.find((x) => x.variant_id === variant.id && x.branch_id === b.id)?.status ?? 'out_of_stock';
                return (
                  <li key={b.id} className="flex items-center justify-between">
                    <span>{b.name}</span>
                    <span className={`badge ${AVAILABILITY_CLASS[s]}`}>{AVAILABILITY_LABEL[s]}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">هذه التركيبة من الخيارات غير متوفرة. جرّب خياراً آخر أو اسألنا عنها.</p>
        )}
      </div>
    </div>
  );
}
