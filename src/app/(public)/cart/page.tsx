import type { Metadata } from 'next';
import { CartView } from './CartView';

export const metadata: Metadata = { title: 'السلة', robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page max-w-3xl space-y-4 py-8">
      <h1 className="text-xl font-bold">سلة المشتريات</h1>
      <CartView />
    </div>
  );
}
