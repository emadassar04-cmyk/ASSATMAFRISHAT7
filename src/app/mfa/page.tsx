import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MfaForm } from './MfaForm';

export const metadata: Metadata = { title: 'التحقق بخطوتين', robots: { index: false } };

export default function MfaPage() {
  return (
    <main className="container-page flex min-h-dvh max-w-md items-center py-10">
      <div className="card w-full space-y-4 p-6">
        <h1 className="text-xl font-bold">التحقق بخطوتين (2FA)</h1>
        <Suspense><MfaForm /></Suspense>
      </div>
    </main>
  );
}
