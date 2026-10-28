export const metadata = { title: 'لا يوجد اتصال' };

export default function OfflinePage() {
  return (
    <main className="container-page py-20 text-center">
      <p className="text-5xl">📡</p>
      <h1 className="mt-4 text-xl font-bold">لا يوجد اتصال بالإنترنت</h1>
      <p className="mt-2 text-muted">تحقق من الاتصال ثم أعد المحاولة. الصفحات التي زرتها سابقاً متاحة دون اتصال.</p>
    </main>
  );
}
