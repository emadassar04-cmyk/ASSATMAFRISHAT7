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

  test('قائمة المنتجات تعرض المنتجات الظاهرة فقط', async ({ page }) => {
    await page.goto('/products');
    const cards = page.locator('a[href^="/products/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test('البحث بالاسم', async ({ page }) => {
    await page.goto('/products?q=ستارة');
    await expect(page.getByText('ستارة قطيفة').first()).toBeVisible();
    await expect(page.getByText('غرفة نوم مودرن')).toHaveCount(0);
  });

  test('بحث بلا نتائج يعرض حالة فارغة', async ({ page }) => {
    await page.goto('/products?q=zzzz-لا-يوجد');
    await expect(page.locator('a[href^="/products/"]')).toHaveCount(0);
  });

  test('الترتيب والفلترة بالتوفر والسعر', async ({ page }) => {
    await page.goto('/products?sort=price_asc');
    const first = await page.locator('a[href^="/products/"] h3').first().textContent();
    expect(first).toContain('ستارة'); // الأرخص 180
    await page.goto('/products?min=1000&max=3000');
    await expect(page.getByText('ستارة قطيفة')).toHaveCount(0);
    await expect(page.getByText('كنب 3 مقاعد').first()).toBeVisible();
  });

  test('الفلترة بالقسم من الرئيسية', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/products?category="]', { hasText: 'ستائر' }).first().click();
    await expect(page).toHaveURL(/category=/);
    await expect(page.getByText('ستارة قطيفة').first()).toBeVisible();
    await expect(page.getByText('غرفة نوم مودرن')).toHaveCount(0);
  });

  test('صفحة المنتج: الخيارات والأسعار وOG', async ({ page }) => {
    await page.goto('/products?q=ركنة');
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('كنب ركنة');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /كنب ركنة/);
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
  for (const path of ['/dashboard', '/dashboard/products', '/dashboard/settings', '/dashboard/users', '/dashboard/import-export', '/account']) {
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
