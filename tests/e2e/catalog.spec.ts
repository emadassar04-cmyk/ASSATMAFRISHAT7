import { expect, test } from '@playwright/test';

// تعمل على بيانات Supabase الحقيقية (seed التجريبي). تتطلب بناءً مسبقاً: npm run build

test.describe('الواجهة العامة', () => {
  test('الرئيسية: RTL وأقسام وعروض ومنتجات وفروع من الإعدادات', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle(/مفروشات العصار/);
    await expect(page.getByRole('heading', { name: 'الأقسام' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'فروعنا' })).toBeVisible();
    expect(await page.locator('a[href^="/products?category="]').count()).toBeGreaterThanOrEqual(5);
  });

  test('قائمة المنتجات تعرض المنتجات الظاهرة', async ({ page }) => {
    await page.goto('/products');
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });

  test('البحث بالاسم يعيد المنتج المطلوب ويستبعد غيره', async ({ page }) => {
    await page.goto('/products');
    const names = (await page.locator('a[href^="/products/"] h3').allTextContents()).map((t) => t.trim()).filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    const word = names[0].split(/\s+/).sort((x, y) => y.length - x.length)[0];
    await page.goto(`/products?q=${encodeURIComponent(word)}`);
    const found = (await page.locator('a[href^="/products/"] h3').allTextContents()).map((t) => t.trim());
    expect(found).toContain(names[0]);
    for (const n of found) expect(n).toContain(word);
  });

  test('بحث بلا نتائج يعرض حالة فارغة', async ({ page }) => {
    await page.goto('/products?q=zzzz-لا-يوجد');
    await expect(page.locator('a[href^="/products/"]')).toHaveCount(0);
  });

  const prices = async (page: import('@playwright/test').Page) =>
    (await page.locator('a[href^="/products/"] bdi').allTextContents()).map((t) => (t.match(/[\d,]+/g) ?? []).map((x) => Number(x.replace(/,/g, ''))));

  test('الترتيب بالسعر تصاعدياً وتنازلياً', async ({ page }) => {
    await page.goto('/products?sort=price_asc');
    const asc = (await prices(page)).map((p) => p[0]);
    expect(asc.length).toBeGreaterThan(1);
    expect(asc).toEqual([...asc].sort((x, y) => x - y));
    await page.goto('/products?sort=price_desc');
    const desc = (await prices(page)).map((p) => p[0]);
    expect(desc).toEqual([...desc].sort((x, y) => y - x));
  });

  test('الفلترة بنطاق السعر', async ({ page }) => {
    await page.goto('/products?min=1000&max=3000');
    for (const p of await prices(page)) expect(p.some((n) => n >= 1000 && n <= 3000)).toBe(true);
  });

  test('الفلترة بالقسم من الرئيسية', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/products?category="]').first().click();
    await expect(page).toHaveURL(/category=/);
    await expect(page.getByRole('heading', { name: /المنتجات/ }).first()).toBeVisible();
  });

  test('صفحة المنتج: العنوان وOG بالاسم والسعر', async ({ page }) => {
    await page.goto('/products');
    await page.locator('a[href^="/products/"]').first().click();
    await page.waitForURL(/\/products\/[^/?]+$/);
    const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
    expect(name).not.toBe('');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', name);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /₪/);
  });

  test('منتج غير موجود 404', async ({ page }) => {
    const res = await page.goto('/products/غير-موجود-أبداً');
    expect(res?.status()).toBe(404);
  });

  test('الفروع والعروض والسياسات', async ({ page }) => {
    await page.goto('/branches');
    await expect(page.getByText('فرع دير البلح').first()).toBeVisible();
    await page.goto('/offers');
    await expect(page.getByText('عرض الافتتاح').first()).toBeVisible();
    for (const slug of ['exchange', 'privacy', 'terms', 'data-deletion', 'custom-orders']) {
      const res = await page.goto(`/policies/${slug}`);
      expect(res?.status(), slug).toBe(200);
    }
    expect((await page.goto('/policies/nope'))?.status()).toBe(404);
  });

  test('SEO: sitemap وrobots وmanifest', async ({ request }) => {
    const sm = await request.get('/sitemap.xml');
    expect(sm.status()).toBe(200);
    expect(await sm.text()).toContain('/products/');
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const mf = await (await request.get('/manifest.webmanifest')).json();
    expect(mf.name).toBeTruthy();
  });

  test('إعدادات الثيم تصل كمتغيرات CSS', async ({ page }) => {
    await page.goto('/');
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    expect(primary).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

test.describe('الحماية', () => {
  for (const path of ['/dashboard', '/dashboard/products', '/dashboard/settings', '/dashboard/users', '/dashboard/import-export', '/dashboard/integrations', '/dashboard/orders', '/account']) {
    test(`${path} بلا جلسة يحوّل إلى الدخول`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('تصدير المنتجات بلا جلسة مرفوض', async ({ request }) => {
    const res = await request.get('/api/dashboard/products-export', { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(res.status());
  });

  test('صفحة الدخول فيها زر Google فقط (لا حقل جوال)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
    await expect(page.locator('input[type="tel"], input[name="phone"]')).toHaveCount(0);
  });

  test('callback بلا code يعود للدخول مع خطأ', async ({ page }) => {
    await page.goto('/api/auth/callback');
    await expect(page).toHaveURL(/\/login\?error=1/);
  });

  test('الـ callback لا يعيد التوجيه لدومين خارجي', async ({ request }) => {
    const res = await request.get('/api/auth/callback?next=//evil.com', { maxRedirects: 0 });
    const loc = res.headers()['location'] ?? '';
    expect(loc).not.toContain('evil.com');
  });
});

test.describe('PWA', () => {
  test('manifest صالح للتثبيت', async ({ request }) => {
    const mf = await (await request.get('/manifest.webmanifest')).json();
    expect(mf.display).toMatch(/standalone|fullscreen|minimal-ui/);
    expect(mf.start_url).toBeTruthy();
    const sizes = (mf.icons ?? []).map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  test('يعمل بلا اتصال: الصفحات المخزّنة وصفحة /offline', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.goto('/products'); // يُخزَّن في الكاش
    await page.reload();
    await context.setOffline(true);
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: /المنتجات/ }).first()).toBeVisible();
    await page.goto('/about-غير-مخزنة-أبداً').catch(() => {});
    await expect(page.locator('body')).toContainText(/اتصال|offline|إنترنت/i);
    await context.setOffline(false);
  });
});
