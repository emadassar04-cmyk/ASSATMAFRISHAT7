// أنواع الصفوف المستخدمة في الواجهة (مطابقة لـ supabase/migrations)
export type Availability = 'available' | 'limited' | 'out_of_stock' | 'made_to_order';
export type AppRole = 'customer' | 'moderator' | 'admin' | 'auditor';

export interface Category {
  id: string; parent_id: string | null; slug: string; name: string; description: string | null;
  image_path: string | null; icon: string | null; is_visible: boolean; sort_order: number;
}
export interface Branch {
  id: string; slug: string; name: string; address: string | null; phone: string | null;
  whatsapp: string | null; map_url: string | null; is_active: boolean; sort_order: number;
}
export interface BranchHour { id: string; branch_id: string; weekday: number; opens_at: string; closes_at: string }
export interface ProductCardData {
  id: string; slug: string; name: string; category_id: string | null; price_from: number; price_to: number;
  best_status: Availability; image_path: string | null; is_featured: boolean;
}
export interface Product {
  id: string; category_id: string | null; slug: string; name: string; description: string | null;
  base_price: number; is_visible: boolean; is_featured: boolean; is_custom_orderable: boolean; view_count: number;
}
export interface OptionType { id: string; name: string; sort_order: number }
export interface OptionValue { id: string; type_id: string; value: string; swatch: string | null; sort_order: number }
export interface Variant {
  id: string; product_id: string; sku: string | null; price: number; compare_at_price: number | null;
  is_active: boolean; sort_order: number; variant_options?: { value_id: string }[];
}
export interface Offer {
  id: string; title: string; description: string | null; image_path: string | null;
  discount_type: 'percent' | 'fixed' | null; discount_value: number | null;
  starts_at: string | null; ends_at: string | null; is_visible: boolean;
}
export interface StoreSettings {
  store: { name: string; tagline?: string; about?: string; logo_path?: string | null };
  theme: { colors?: Record<string, string>; radius?: string; font?: string };
  contact: { phone?: string; whatsapp?: string; telegram?: string; facebook?: string; email?: string };
  hero: { title?: string; subtitle?: string; image_path?: string | null };
  deposit: { enabled: boolean; percent: number };
  [key: string]: unknown;
}
export interface Policy { title: string; summary?: string; body: string }
