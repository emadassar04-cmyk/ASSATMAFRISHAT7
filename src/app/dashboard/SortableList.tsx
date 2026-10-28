'use client';
import { useState, useTransition, type ReactNode } from 'react';

/**
 * قائمة قابلة للترتيب: سحب وإفلات (حاسوب) + أزرار ▲▼ (جوال).
 * عناصر الصفوف تُرسم في الخادم، والترتيب الجديد يُحفظ عبر Server Action.
 */
export function SortableList({ items, onReorder }: {
  items: { id: string; node: ReactNode }[];
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(items.map((i) => [i.id, i.node]));
  // يتزامن مع التغييرات القادمة من الخادم (إضافة/حذف)
  const ids = [...order.filter((id) => byId.has(id)), ...items.map((i) => i.id).filter((id) => !order.includes(id))];

  const commit = (next: string[]) => { setOrder(next); start(() => onReorder(next)); };
  const move = (id: string, dir: -1 | 1) => {
    const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]]; commit(next);
  };
  const drop = (target: string) => {
    if (!dragId || dragId === target) return;
    const next = ids.filter((x) => x !== dragId);
    next.splice(next.indexOf(target), 0, dragId);
    setDragId(null); commit(next);
  };

  return (
    <ul className={`space-y-2 ${pending ? 'opacity-70' : ''}`}>
      {ids.map((id) => (
        <li key={id} draggable onDragStart={() => setDragId(id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(id)}
          className="card p-2">
          <div className="flex items-start gap-2">
            <span className="mt-2 cursor-grab select-none text-muted" aria-hidden title="اسحب للترتيب">⠿</span>
            <div className="min-w-0 flex-1">{byId.get(id)}</div>
            <div className="flex flex-col">
              <button type="button" className="btn btn-outline btn-sm !min-h-7 !px-2" aria-label="للأعلى" onClick={() => move(id, -1)}>▲</button>
              <button type="button" className="btn btn-outline btn-sm !min-h-7 !px-2" aria-label="للأسفل" onClick={() => move(id, 1)}>▼</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
