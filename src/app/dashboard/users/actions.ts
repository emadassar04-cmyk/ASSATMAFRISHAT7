'use server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { bool, go, isUuid, str, strOrNull } from '../actions-util';

const BACK = '/dashboard/users';
const ROLES = ['customer', 'moderator', 'admin', 'auditor'];

/** تعديل دور/حالة مستخدم: عبر RPC تتحقق من الإداري + 2FA داخل قاعدة البيانات */
export async function updateUser(formData: FormData) {
  const { supabase } = await requireAdmin(BACK);
  const id = str(formData, 'id'); const role = str(formData, 'role');
  if (!isUuid(id) || !ROLES.includes(role)) go(BACK, { error: 'بيانات غير صالحة' });
  const branch = str(formData, 'branch_id');
  const { error } = await supabase.rpc('admin_update_profile', {
    p_id: id, p_role: role, p_is_active: bool(formData, 'is_active'),
    p_branch_id: isUuid(branch) ? branch : null, p_full_name: strOrNull(formData, 'full_name'),
  });
  if (error) go(BACK, { error: error.message.includes('demote self') ? 'لا يمكنك إنزال صلاحياتك أو إيقاف حسابك' : 'تعذّر الحفظ' });
  go(BACK, { ok: 'تم تحديث المستخدم' });
}

/** إضافة موظف برقم جواله: يُنشأ حسابه ويدخل لاحقاً بـ OTP */
export async function addStaff(formData: FormData) {
  await requireAdmin(BACK);
  const phone = normalizePhone(str(formData, 'phone'));
  const role = str(formData, 'role');
  if (!phone || !['moderator', 'admin', 'auditor'].includes(role)) go(BACK, { error: 'رقم أو دور غير صالح' });
  const admin = createAdminClient();
  let { data: p } = await admin.from('profiles').select('id').eq('phone', phone).maybeSingle();
  if (!p) {
    const { error } = await admin.auth.admin.createUser({
      email: `${phone.replace(/\D/g, '')}@phone.alassar.local`, email_confirm: true, user_metadata: { phone },
    });
    if (error) go(BACK, { error: 'تعذّر إنشاء الحساب' });
    p = (await admin.from('profiles').select('id').eq('phone', phone).single()).data;
  }
  const { error } = await admin.from('profiles').update({ role, full_name: strOrNull(formData, 'full_name'), is_active: true }).eq('id', p!.id);
  if (error) go(BACK, { error: 'تعذّر تعيين الدور' });
  go(BACK, { ok: 'تمت إضافة المستخدم. يدخل برقمه عبر رمز التحقق.' });
}
