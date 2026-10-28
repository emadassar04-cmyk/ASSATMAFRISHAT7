import Link from 'next/link';
import { requireRole } from '@/lib/auth';

export const metadata = { title: { default: 'لوحة التحكم', template: '%s | لوحة التحكم' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

const STAFF_LINKS = [
  { href: '/dashboard', label: 'نظرة عامة' },
  { href: '/dashboard/categories', label: 'الأقسام' },
  { href: '/dashboard/products', label: 'المنتجات' },
  { href: '/dashboard/options', label: 'الخصائص' },
  { href: '/dashboard/offers', label: 'العروض' },
  { href: '/dashboard/inbox', label: 'المحادثات' },
  { href: '/dashboard/custom-orders', label: 'طلبات التفصيل' },
  { href: '/dashboard/import-export', label: 'استيراد/تصدير' },
];
const ADMIN_LINKS = [
  { href: '/dashboard/orders', label: 'الطلبات' },
  { href: '/dashboard/branches', label: 'الفروع والدوام' },
  { href: '/dashboard/settings', label: 'الإعدادات' },
  { href: '/dashboard/integrations', label: 'الربط (واتساب/فيسبوك)' },
  { href: '/dashboard/users', label: 'المستخدمون' },
  { href: '/dashboard/audit', label: 'سجل التعديلات' },
];
const AUDITOR_LINKS = [{ href: '/dashboard/audit', label: 'سجل التعديلات' }];
const ROLE_TITLE = { admin: 'الإدارة', moderator: 'مشرف الصفحات', auditor: 'مشرف المتابعة' } as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole(['moderator', 'admin', 'auditor']);
  const links = profile.role === 'admin' ? [...STAFF_LINKS, ...ADMIN_LINKS] : profile.role === 'auditor' ? AUDITOR_LINKS : STAFF_LINKS;
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-border bg-surface md:min-h-dvh md:w-56 md:border-b-0 md:border-e">
        <div className="flex items-center justify-between p-3 md:block">
          <Link href="/" className="font-bold text-primary">← الموقع</Link>
          <p className="text-xs text-muted md:mt-1">{ROLE_TITLE[profile.role as keyof typeof ROLE_TITLE]}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-1" aria-label="قائمة اللوحة">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block shrink-0 rounded-card px-3 py-2 text-sm hover:bg-border/50">{l.label}</Link>
          ))}
          <form action="/api/auth/logout" method="post" className="shrink-0">
            <button className="w-full rounded-card px-3 py-2 text-start text-sm text-danger hover:bg-border/50">خروج</button>
          </form>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
