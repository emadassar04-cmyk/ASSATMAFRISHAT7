import { expect, test, type Page } from '@playwright/test';

// تعمل على بيانات Supabase الحقيقية؛ لا تعتمد على منتج بعينه: تبحث عن أول منتج قابل للشراء.
async function addFirstPurchasable(page: Page): Promise<string> {
  await page.goto('/products');
  const hrefs = await page.locator('a[href^="/products/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!));
  for (const href of [...new Set(hrefs)]) {
    await page.goto(href);
    const btn = page.getByRole('button', { name: 'أضف إلى السلة' });
    if ((await btn.count()) && (await btn.isEnabled())) {
      const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
      await btn.click();
      await expect(page.getByRole('status')).toContainText('تمت الإضافة');
      return name;
    }
  }
  return '';
}

test.describe('السلة', () => {
  test('سلة فارغة تعرض رسالة ورابط للتصفّح', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByText('سلتك فارغة')).toBeVisible();
    await expect(page.getByRole('link', { name: 'تصفّح المنتجات' })).toBeVisible();
  });

  test('إضافة منتج: العدّاد والسلة والكمية والحذف والبقاء بعد إعادة التحميل', async ({ page }) => {
    const name = await addFirstPurchasable(page);
    test.skip(!name, 'لا يوجد منتج بخيارات ومخزون في القاعدة حالياً');
    await expect(page.getByRole('link', { name: /السلة، 1 قطعة/ })).toBeVisible();

    await page.getByRole('link', { name: 'عرض السلة وإتمام الطلب' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole('link', { name })).toBeVisible();

    await page.getByRole('button', { name: 'زيادة' }).click();
    await expect(page.getByRole('link', { name: /السلة، 2 قطعة/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: /السلة، 2 قطعة/ })).toBeVisible();   // محفوظة محلياً

    await page.getByRole('button', { name: 'إنقاص' }).click();
    await expect(page.getByRole('button', { name: 'إنقاص' })).toBeDisabled();       // لا ينزل عن 1
    await page.getByRole('button', { name: 'حذف' }).click();
    await expect(page.getByText('سلتك فارغة')).toBeVisible();
  });

  test('إضافة المنتج مرتين تدمج السطر ولا تكرره', async ({ page }) => {
    const name = await addFirstPurchasable(page);
    test.skip(!name, 'لا يوجد منتج بخيارات ومخزون في القاعدة حالياً');
    await page.getByRole('button', { name: 'أضف إلى السلة' }).click();
    await page.goto('/cart');
    await expect(page.getByRole('link', { name })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /السلة، 2 قطعة/ })).toBeVisible();
  });

  test('بيانات سلة تالفة أو مزوّرة في التخزين لا تكسر الصفحة', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cart:v1', '{"x":'));
    await page.goto('/cart');
    await expect(page.getByText('سلتك فارغة')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('cart:v1', JSON.stringify([{ variantId: 'not-a-uuid', price: -1, qty: 5 }, null, 7])));
    await page.reload();
    await expect(page.getByText('سلتك فارغة')).toBeVisible();
  });
});

test.describe('حماية مسارات الطلب', () => {
  for (const path of ['/checkout', '/orders/aaaaaaaa-0000-0000-0000-000000000001', '/dashboard/orders', '/dashboard/orders/aaaaaaaa-0000-0000-0000-000000000001']) {
    test(`${path} بلا جلسة يحوّل إلى الدخول`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
