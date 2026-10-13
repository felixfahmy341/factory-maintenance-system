حزمة نظام صيانة الإطفاء — إشعارات Push عند إضافة/تعديل أوامر الصيانة
====================================================================

ما تم تنفيذه في الملفات
----------------------
- index.html: زر تفعيل الإشعارات يطلب الإذن، يسجل اشتراك Push في المتصفح، ويحفظه في public.push_subscriptions للحساب الذي سجّل الدخول.
- push-config.js: مكان المفتاح العام VAPID فقط؛ استبدل القيمة التجريبية بالمفتاح العام الناتج عن توليد المفاتيح.
- service-worker.js: استقبال إشعارات Push وعرض إشعار نظام التشغيل حتى عندما تكون الصفحة مغلقة، بحسب دعم النظام والمتصفح.
- supabase/functions/send-maintenance-push/index.ts: Edge Function تتحقق من سر Webhook، وتقرأ الاشتراكات باستخدام صلاحية الخدمة، وترسل Push عبر VAPID عند INSERT/UPDATE لأوامر الصيانة، وتحذف الاشتراكات المنتهية (404/410).
- supabase/config.toml: يوقف تحقق JWT القياسي لهذه الوظيفة لأن Webhook يرسل سرًا مخصصًا بدل JWT. لا تنشرها قبل إعداد PUSH_WEBHOOK_SECRET قوي.
- roles_and_push_setup.sql: تجهيز جدول الاشتراكات وفصل دور ملاحظ الإطفاء عن مسؤول النظام. راجع ترحيل الأدوار والحسابات الحالية قبل تشغيله.

مهم: لا أستطيع نشر Edge Function أو ضبط Webhook داخل مشروع Supabase نيابةً عنك من هذه الملفات وحدها. الخطوات أدناه لازمة مرة واحدة في مشروعك.

الخطوة 1 — قاعدة البيانات
-------------------------
1. خذ نسخة احتياطية.
2. افتح Supabase Dashboard > SQL Editor.
3. راجع ثم نفّذ roles_and_push_setup.sql.
4. تأكد أن public.work_orders موجودة، وأن مستخدمي التطبيق يستطيعون إضافة اشتراكاتهم فقط عبر سياسة RLS.

الخطوة 2 — توليد مفاتيح VAPID
-----------------------------
على جهازك الذي عليه Node.js، نفّذ:
  npx web-push generate-vapid-keys

ستظهر Public Key وPrivate Key.
- ضع Public Key فقط في قيمة vapidPublicKey داخل push-config.js، ثم انشر الملف مع الواجهة.
- احتفظ بـ Private Key سرًا؛ لا تضعه في HTML أو push-config.js أو Git أو أي ملف منشور.

الخطوة 3 — نشر خدمة الخلفية
---------------------------
ثبّت Supabase CLI وسجّل الدخول، ثم من مجلد الحزمة نفّذ:
  supabase login
  supabase link --project-ref nphfstfzjcqanzpvxjqs

ولّد سر Webhook قويًا عشوائيًا. مثال على جهاز Linux/macOS:
  openssl rand -hex 32

احتفظ بالقيمة نفسها لاستخدامها في سر Edge Function ورأس Webhook. ثم نفّذ (استبدل القيم بين < >، ولا تكتب الأقواس):
  supabase secrets set VAPID_PUBLIC_KEY=<PUBLIC_KEY> VAPID_PRIVATE_KEY=<PRIVATE_KEY> VAPID_SUBJECT=mailto:<YOUR_ADMIN_EMAIL> PUSH_WEBHOOK_SECRET=<RANDOM_WEBHOOK_SECRET>

إذا لم يكن SUPABASE_SERVICE_ROLE_KEY متاحًا تلقائيًا في بيئة الوظيفة، أضفه من أسرار المشروع باستخدام مفتاح الخدمة من Dashboard. لا تشاركه ولا تضعه في الواجهة أو في هذا الملف.

ثم انشر:
  supabase functions deploy send-maintenance-push

الخطوة 4 — إعداد Webhook في Supabase
-----------------------------------
من Dashboard افتح Database > Webhooks (قد يختلف الاسم قليلًا):
1. أنشئ Webhook جديدًا لجدول public.work_orders.
2. فعّل الحدثين INSERT و UPDATE.
3. Method: POST.
4. URL:
   https://nphfstfzjcqanzpvxjqs.supabase.co/functions/v1/send-maintenance-push
5. أضف Header:
   x-push-webhook-secret: <نفس PUSH_WEBHOOK_SECRET>
6. احفظ Webhook.

لا تستخدم مفتاح service_role كرأس للـWebhook. السر المخصص أعلاه هو الذي يتحقق منه الكود.

الخطوة 5 — نشر الواجهة وتفعيل اشتراك كل مستخدم
----------------------------------------------
1. انشر index.html وpush-config.js وmanifest.webmanifest وservice-worker.js والأيقونات على HTTPS، في المجلد نفسه.
2. افتح التطبيق وسجّل الدخول.
3. اضغط «تفعيل التنبيهات والصوت» واسمح بالإشعارات. كرر ذلك لكل حساب/جهاز يريد استقبال التنبيهات.
4. اختبر بإضافة أمر صيانة ثم تعديل الحالة أو وصف العطل.

ملاحظات التشغيل والأمان
-----------------------
- Push يرسل إشعارًا لكل اشتراك مسجّل في جدول push_subscriptions. احمِ بيانات المشروع وراجع صلاحيات المستخدمين.
- تغييرات UPDATE ترسل إشعارًا فقط إذا تغيرت حالة الأمر أو حقول الصيانة المهمة. تحديثات الأعمدة الأخرى لا ترسل إشعارًا.
- إذا كان الجهاز لا يسمح بالإشعارات، أو تم إيقافها من إعدادات النظام، فلن يصل إشعار مرئي/صوتي مضمون.
- لا يمكن إجبار الصوت على العمل عند وضع الصامت أو التركيز أو قيود المتصفح. Push لا يضمن صوتًا عاليًا.
- إذا كانت الواجهة تعمل في نطاق/مجلد مختلف، راجع مسارات manifest وservice worker وicons.
- وظيفة الخلفية لا تعدل RLS لأوامر الصيانة ولا تمنح ملاحظ الإطفاء صلاحيات مسؤول النظام.

التشخيص
-------
- راجع Edge Functions > send-maintenance-push > Logs.
- تحقق من أن push_subscriptions تحتوي اشتراكًا بعد ضغط الزر أثناء تسجيل الدخول.
- تحقق من إعداد Webhook والرأس السري ومن أن المفتاح العام في push-config.js يطابق VAPID_PUBLIC_KEY في الأسرار.
- إذا تغيرت مفاتيح VAPID، أعد نشر المفتاح العام واشترك المستخدمون من جديد عند الحاجة.
