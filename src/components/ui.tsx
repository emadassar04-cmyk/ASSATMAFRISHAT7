import Link from 'next/link';
import { AVAILABILITY_CLASS, AVAILABILITY_LABEL, formatPrice, priceRange, publicUrl } from '@/lib/format';
import type { Availability, ProductCardData } from '@/types';

export function StatusBadge({ status }: { status: Availability }) {
  return <span className={`badge ${AVAILABILITY_CLASS[status]}`}>{AVAILABILITY_LABEL[status]}</span>;
}

/** صورة بنسبة موحدة مع Lazy Loading، وبديل عند غياب الصورة */
export function Img({ bucket, path, alt, className = '', priority = false }: {
  bucket: string; path: string | null | undefined; alt: string; className?: string; priority?: boolean;
}) {
  const src = publicUrl(bucket, path);
  return (
    <div className={`relative aspect-[4/3] overflow-hidden bg-border/40 ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-4xl text-muted/50" aria-hidden>🛋️</div>
      )}
    </div>
  );
}

export function ProductCard({ p }: { p: ProductCardData }) {
  return (
    <Link href={`/products/${encodeURIComponent(p.slug)}`} className="card group block overflow-hidden">
      <Img bucket="product-images" path={p.image_path} alt={p.name} className="rounded-t-card" />
      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-medium">{p.name}</h3>
        <p className="font-bold text-primary"><bdi>{priceRange(p.price_from, p.price_to)}</bdi></p>
        <StatusBadge status={p.best_status} />
      </div>
    </Link>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="card p-8 text-center text-muted">{children}</p>;
}

export { formatPrice };
