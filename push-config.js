/* =====================================================================
 * Public client configuration — Push Notifications
 * ---------------------------------------------------------------------
 * يحتوي فقط على المفتاح العام (VAPID Public Key) الخاص بتطبيق
 * "نظام إدارة صيانة السويس للصلب".
 *
 * ⚠️ لا تضع هنا أبدًا:
 *    - VAPID_PRIVATE_KEY
 *    - SUPABASE_SERVICE_ROLE_KEY
 *    - أي مفتاح سري آخر
 *
 * المفتاح الخاص يُخزّن فقط في:
 *    Supabase Dashboard → Edge Functions → Secrets
 * ===================================================================== */

window.FIRE_MAINTENANCE_PUSH_CONFIG = {
  vapidPublicKey: "BL5h9U4kFI0WRuX_nm0CsDDCwF3CSKdMPRgpB7H4EkRABg-VjZ9VF-YMn7CXw4i3y_sBoLgemRoHk2E9-Ic1xkQ"
};
