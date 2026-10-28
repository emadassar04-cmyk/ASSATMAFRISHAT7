'use client';
import { useRef, useState } from 'react';

/** معرض صور بنسبة موحدة مع تكبير (dialog أصلي بدون مكتبات) */
export function ProductGallery({ images, name }: { images: { src: string; alt: string | null }[]; name: string }) {
  const [i, setI] = useState(0);
  const dlg = useRef<HTMLDialogElement>(null);
  if (!images.length) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-card bg-border/40 text-6xl text-muted/50">🛋️</div>;
  }
  const cur = images[i];
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => dlg.current?.showModal()} aria-label="تكبير الصورة"
        className="block w-full cursor-zoom-in overflow-hidden rounded-card bg-border/40">
        <img src={cur.src} alt={cur.alt ?? name} className="aspect-[4/3] w-full object-cover" />
      </button>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((im, idx) => (
            <button key={im.src} type="button" onClick={() => setI(idx)} aria-label={`صورة ${idx + 1}`}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${idx === i ? 'border-primary' : 'border-transparent'}`}>
              <img src={im.src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <dialog ref={dlg} className="m-auto max-h-[92vh] max-w-[96vw] rounded-card bg-surface p-2 backdrop:bg-black/70"
        onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <img src={cur.src} alt={cur.alt ?? name} className="max-h-[85vh] max-w-full object-contain" />
        <form method="dialog" className="mt-2 text-center"><button className="btn btn-outline btn-sm">إغلاق</button></form>
      </dialog>
    </div>
  );
}
