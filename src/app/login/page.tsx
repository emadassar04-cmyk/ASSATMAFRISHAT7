import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'تسجيل الدخول', robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="container-page flex min-h-dvh max-w-md items-center py-10">
      <div className="card w-full space-y-4 p-6">
        <h1 className="text-xl font-bold">تسجيل الدخول</h1>
        <p className="text-sm text-muted">أدخل رقم جوالك وسنرسل لك رمز التحقق عبر واتساب أو تلجرام.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </main>
  );
}
