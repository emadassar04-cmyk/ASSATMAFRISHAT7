-- بيانات تجريبية للتطوير فقط (placeholders). لا تُشغَّل على الإنتاج.
-- الإعدادات الحقيقية تُعدَّل من لوحة الإدارة.

insert into public.settings (key, value, is_public) values
 ('store', '{"name":"مفروشات العصار","tagline":"راحة بيتك تبدأ من هنا","about":"[نبذة عن المتجر]","logo_path":null}', true),
 ('theme', '{"colors":{"bg":"#faf7f2","surface":"#ffffff","fg":"#2b211a","muted":"#7a6a5c","primary":"#6b4226","primaryFg":"#ffffff","accent":"#c9a24b","border":"#e8dfd2"},"radius":"0.75rem","font":"tajawal"}', true),
 ('contact', '{"phone":"[رقم التواصل]","whatsapp":"[رقم واتساب]","telegram":"[معرّف تلجرام]","facebook":"[رابط صفحة فيسبوك]","email":"[البريد]"}', true),
 ('hero', '{"title":"أثاث يليق ببيتك","subtitle":"كنب، غرف نوم، سفرة، ستائر وتنجيد بأسعار مناسبة","image_path":null}', true),
 ('policy.exchange', '{"title":"سياسة الاستبدال","summary":"الاستبدال فقط (بدون استرداد مالي) ويتم حضورياً داخل الفرع.","body":"[نص سياسة الاستبدال الكامل]"}', true),
 ('policy.custom_orders', '{"title":"شروط الطلبات المفصّلة","body":"[نص شروط الطلبات المفصّلة]"}', true),
 ('policy.privacy', '{"title":"سياسة الخصوصية","body":"[نص سياسة الخصوصية]"}', true),
 ('policy.terms', '{"title":"شروط الاستخدام","body":"[نص شروط الاستخدام]"}', true),
 ('policy.data_deletion', '{"title":"تعليمات حذف البيانات","body":"[تعليمات حذف بيانات المستخدم]"}', true),
 ('deposit', '{"enabled":false,"percent":0}', true)
on conflict (key) do nothing;

insert into public.branches (slug, name, address, phone, whatsapp, map_url, sort_order) values
 ('دير-البلح', 'فرع دير البلح', '[عنوان فرع دير البلح]', '[رقم الفرع]', '[واتساب الفرع]', null, 1),
 ('النصيرات', 'فرع النصيرات', '[عنوان فرع النصيرات]', '[رقم الفرع]', '[واتساب الفرع]', null, 2)
on conflict (slug) do nothing;

-- ساعات الدوام [placeholder]: كل الأيام عدا الجمعة 09:00-21:00 (تُعدَّل من اللوحة)
insert into public.branch_hours (branch_id, weekday, opens_at, closes_at)
select b.id, d, '09:00', '21:00' from public.branches b, unnest(array[0,1,2,3,4,6]) d
where not exists (select 1 from public.branch_hours);

insert into public.payment_methods (code, name, instructions, details, sort_order) values
 ('bank_of_palestine','بنك فلسطين','حوّل المبلغ ثم أرفق صورة الإيصال','{"account":"[رقم الحساب]","holder":"[اسم صاحب الحساب]"}',1),
 ('palpay','محفظة PalPay','حوّل المبلغ ثم أرفق صورة الإيصال','{"account":"[رقم المحفظة]","holder":"[اسم صاحب المحفظة]"}',2),
 ('jawwal_pay','جوال باي','حوّل المبلغ ثم أرفق صورة الإيصال','{"account":"[رقم جوال باي]","holder":"[اسم صاحب الحساب]"}',3)
on conflict (code) do nothing;

insert into public.categories (slug, name, description, sort_order) values
 ('كنب','كنب','كنب بأشكال ومقاسات متعددة',1),
 ('غرف-نوم','غرف نوم','غرف نوم كاملة وقطع منفردة',2),
 ('سفرة','سفرة','طاولات سفرة وكراسي',3),
 ('ستائر','ستائر','ستائر بخامات وألوان متنوعة',4),
 ('تنجيد','تنجيد','خدمة تنجيد وتجديد الأثاث',5)
on conflict (slug) do nothing;

insert into public.option_types (name, sort_order) values ('اللون',1),('الخامة',2),('المقاس',3)
on conflict (name) do nothing;
insert into public.option_values (type_id, value, swatch, sort_order)
select t.id, v.value, v.swatch, v.ord from public.option_types t
join (values
 ('اللون','بيج','#d9c7a5',1),('اللون','بني','#6b4226',2),('اللون','رمادي','#8a8a8a',3),
 ('الخامة','قطن',null,1),('الخامة','قطيفة',null,2),('الخامة','جلد',null,3),
 ('المقاس','3 مقاعد',null,1),('المقاس','ركنة',null,2),('المقاس','عادي',null,3)
) as v(tname,value,swatch,ord) on v.tname = t.name
on conflict (type_id, value) do nothing;

-- منتجات تجريبية مع Variants ومخزون لكل فرع
do $$
declare
  c_sofa uuid := (select id from public.categories where slug='كنب');
  c_bed uuid := (select id from public.categories where slug='غرف-نوم');
  c_curt uuid := (select id from public.categories where slug='ستائر');
  p uuid; v uuid;
begin
  if exists (select 1 from public.products) then return; end if;

  insert into public.products (category_id, slug, name, description, base_price, is_featured)
    values (c_sofa,'كنب-ركنة-كلاسيك','كنب ركنة كلاسيك','[وصف المنتج]',2400,true) returning id into p;
  for v in
    insert into public.product_variants (product_id, sku, price, sort_order) values
      (p,'SOFA-1-BEIGE',2400,1),(p,'SOFA-1-BROWN',2600,2) returning id
  loop
    insert into public.branch_stock (variant_id, branch_id, quantity)
      select v, b.id, case when b.sort_order = 1 then 5 else 1 end from public.branches b;
  end loop;
  insert into public.variant_options (variant_id, value_id)
    select pv.id, ov.id from public.product_variants pv join public.option_values ov on
      (pv.sku='SOFA-1-BEIGE' and ov.value in ('بيج','ركنة','قطيفة')) or
      (pv.sku='SOFA-1-BROWN' and ov.value in ('بني','ركنة','جلد'));

  insert into public.products (category_id, slug, name, description, base_price)
    values (c_sofa,'كنب-3-مقاعد','كنب 3 مقاعد','[وصف المنتج]',1500) returning id into p;
  insert into public.product_variants (product_id, sku, price) values (p,'SOFA-2-GREY',1500) returning id into v;
  insert into public.branch_stock (variant_id, branch_id, quantity) select v, b.id, 0 from public.branches b;

  insert into public.products (category_id, slug, name, description, base_price, is_custom_orderable)
    values (c_bed,'غرفة-نوم-مودرن','غرفة نوم مودرن','[وصف المنتج]',5200,true) returning id into p;
  insert into public.product_variants (product_id, sku, price) values (p,'BED-1',5200) returning id into v;
  insert into public.branch_stock (variant_id, branch_id, quantity, status)
    select v, b.id, 0, 'made_to_order' from public.branches b;

  insert into public.products (category_id, slug, name, description, base_price)
    values (c_curt,'ستارة-قطيفة','ستارة قطيفة','[وصف المنتج]',180) returning id into p;
  insert into public.product_variants (product_id, sku, price) values (p,'CURT-1',180) returning id into v;
  insert into public.branch_stock (variant_id, branch_id, quantity) select v, b.id, 20 from public.branches b;

  insert into public.offers (title, description) values ('عرض الافتتاح','[تفاصيل العرض]');
end $$;
