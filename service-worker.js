/* =====================================================================
 * Service Worker — نظام إدارة صيانة السويس للصلب
 * ---------------------------------------------------------------------
 * المهام:
 *   1) استقبال إشعارات Push من Edge Function "send-push".
 *   2) عرض الإشعار على جهاز المستخدم حتى لو المتصفح مغلق.
 *   3) التعامل مع الضغط على الإشعار وفتح التطبيق.
 *   4) تخزين مؤقت بسيط للملفات الأساسية (Offline-first للأصول).
 *
 * ⚠️ لا تضع أي مفاتيح سرية هنا.
 * ===================================================================== */

const CACHE_VERSION = "sws-maint-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./push-config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

/* =========================================================
 * 1) التثبيت — تخزين الأصول الأساسية
 * ========================================================= */
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);
        // addAll تفشل كلها لو ملف واحد فشل، لذا نستخدم add بشكل فردي
        await Promise.all(
          APP_SHELL.map(url =>
            cache.add(url).catch(err => {
              console.warn("[SW] فشل تخزين:", url, err);
            })
          )
        );
      } catch (err) {
        console.warn("[SW] install error:", err);
      }
      // تفعيل النسخة الجديدة فورًا بدون انتظار إغلاق التبويبات القديمة
      await self.skipWaiting();
    })()
  );
});

/* =========================================================
 * 2) التفعيل — تنظيف النسخ القديمة من الكاش
 * ========================================================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      );
      // السيطرة على كل التبويبات المفتوحة فورًا
      await self.clients.claim();
    })()
  );
});

/* =========================================================
 * 3) استقبال إشعارات Push
 * ========================================================= */
self.addEventListener("push", event => {
  let payload = {
    title: "تحديث أمر صيانة",
    body: "",
    url: "./",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "maintenance-update"
  };

  // محاولة قراءة بيانات الإشعار (JSON)
  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    } catch (_) {
      try {
        payload.body = event.data.text();
      } catch (_) {}
    }
  }

  const options = {
    body: payload.body || "لديك تحديث جديد في أوامر الصيانة.",
    icon: payload.icon || "./icon-192.png",
    badge: payload.badge || "./icon-192.png",
    tag: payload.tag || "maintenance-update",
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || "./",
      timestamp: Date.now()
    },
    actions: [
      { action: "open", title: "فتح التطبيق" },
      { action: "close", title: "إغلاق" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

/* =========================================================
 * 4) الضغط على الإشعار
 * ========================================================= */
self.addEventListener("notificationclick", event => {
  event.notification.close();

  // لو المستخدم ضغط "إغلاق"
  if (event.action === "close") return;

  const targetUrl = event.notification?.data?.url || "./";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      // لو التطبيق مفتوح في تبويب، ركّز عليه
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrlObj = new URL(targetUrl, self.location.origin);
          if (clientUrl.origin === targetUrlObj.origin) {
            await client.focus();
            // لو المتصفح يدعم postMessage، نبلّغ الواجهة عشان تحدّث البيانات
            try {
              client.postMessage({ type: "PUSH_NOTIFICATION_CLICKED" });
            } catch (_) {}
            return;
          }
        } catch (_) {}
      }

      // لو مفيش تبويب مفتوح، افتح تبويب جديد
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});

/* =========================================================
 * 5) إغلاق الإشعارات القديمة عند استقبال إشعار جديد بنفس tag
 * ========================================================= */
self.addEventListener("notificationclose", event => {
  // مفيش إجراء مطلوب، مجرد تسجيل
  console.debug("[SW] notification closed:", event.notification?.tag);
});

/* =========================================================
 * 6) استراتيجية Fetch — Network First مع Fallback للكاش
 * ========================================================= */
self.addEventListener("fetch", event => {
  const req = event.request;

  // تجاهل الطلبات غير GET
  if (req.method !== "GET") return;

  // تجاهل طلبات Supabase API و Storage (نحتاجها دايمًا live)
  const url = new URL(req.url);
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in")
  ) {
    return; // اترك المتصفح يتعامل معها بشكل طبيعي
  }

  // تجاهل طلبات الإشعارات
  if (url.pathname.includes("push") || url.pathname.includes("notification")) {
    return;
  }

  // Network First مع Fallback
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(req);
        // خزّن نسخة محدّثة في الكاش للأصول الثابتة فقط
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.origin === self.location.origin ||
            url.hostname.includes("fonts.gstatic.com") ||
            url.hostname.includes("fonts.googleapis.com"))
        ) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch (_) {
        // فشل الاتصال — جرّب الكاش
        const cached = await caches.match(req);
        if (cached) return cached;

        // لو الطلب عبارة عن صفحة HTML ومافيش كاش، رجّع index.html
        if (req.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }

        // آخر حل — استجابة فشل بسيطة
        return new Response("لا يوجد اتصال بالإنترنت", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })()
  );
});

/* =========================================================
 * 7) رسائل من الواجهة إلى Service Worker
 * ========================================================= */
self.addEventListener("message", event => {
  const data = event.data || {};

  // تحديث فوري للـ SW (يستخدمه التطبيق عند توفر نسخة جديدة)
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  // اختبار محلي للإشعار (يُستخدم من زر "تفعيل التنبيهات")
  if (data.type === "TEST_NOTIFICATION") {
    self.registration.showNotification(data.title || "اختبار إشعار", {
      body: data.body || "هذا إشعار تجريبي من نظام صيانة السويس للصلب.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "test-" + Date.now(),
      vibrate: [200, 100, 200]
    });
    return;
  }

  // تسجيل اشتراك Push جديد (يُستخدم لو أردنا المزامنة)
  if (data.type === "PUSH_SUBSCRIPTION_CHANGED") {
    console.debug("[SW] Push subscription changed:", data.endpoint);
  }
});

/* =========================================================
 * 8) تحديث اشتراك Push تلقائيًا عند تغييره من المتصفح
 * ========================================================= */
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(
    (async () => {
      try {
        const newSubscription = await self.registration.pushManager.subscribe(
          event.oldSubscription.options
        );
        // بلّغ كل التبويبات المفتوحة عشان تحدّث الاشتراك في Supabase
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        for (const client of allClients) {
          try {
            client.postMessage({
              type: "PUSH_SUBSCRIPTION_CHANGED",
              subscription: newSubscription.toJSON()
            });
          } catch (_) {}
        }
      } catch (err) {
        console.warn("[SW] pushsubscriptionchange failed:", err);
      }
    })()
  );
});

console.log("[SW] نظام إدارة صيانة السويس للصلب — Service Worker محمّل ✅");
