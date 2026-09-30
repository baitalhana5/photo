# بيت الهنا — معرض صور العائلة

## البنية المختارة ولماذا

```
المتصفح (GitHub Pages)  ──ID Token──▶  Apps Script (Execute as Me)  ──▶  Drive (مجلد خاص)
   زر Google Sign-In                   1) يتحقق من التوكن مع Google
                                        2) يطابق الإيميل مع القائمة المسموحة
                                        3) يعيد الصور كـ JSON (base64)
```

**مشاكل في الفكرة الأصلية وكيف عُدّلت:**

1. **لا يمكن عرض صور Drive الخاصة بروابط مباشرة** (`<img src="drive.google.com/...">`) إلا إذا كان الملف عامًا، وهذا مرفوض. الحل: Apps Script يقرأ الصورة بصلاحيتك ويعيدها للمتصفح كـ base64 بعد التحقق من المستخدم. المجلد يبقى **Restricted** دائمًا.
2. **Apps Script لا يعرف من هو الزائر** عند النشر بوضع "Execute as Me"، ولا يقرأ ترويسة `Authorization`. الحل: المتصفح يرسل Google ID Token داخل جسم الطلب، والخادم يتحقق منه (التوقيع، `aud`، الانتهاء، `email_verified`) ثم يفحص القائمة المسموحة.
3. **رابط Apps Script سيكون "Anyone"** (ضروري كي يعمل `fetch` من GitHub Pages). هذا آمن لأن كل طلب بلا توكن صالح ومن إيميل مسموح يُرفض. الحماية ليست بإخفاء الرابط.
4. **القائمة المسموحة تُحفظ في Script Properties وليس في GitHub** (المستودع قد يكون عامًا، وفحص `if (email === ...)` في المتصفح ليس حماية).
5. **حدود مجانية**: Apps Script بطيء نسبيًا (1–3 ثوانٍ للطلب) وله حصص يومية. لذلك الشبكة تستخدم مصغّرات صغيرة، وتُحمَّل عند الاقتراب من الشاشة فقط، والعرض الكبير بعرض 1600px وليس الأصل. مناسب لعائلة وبضعة مئات أو آلاف من الصور، لا لآلاف المستخدمين.
6. **تاريخ الترتيب** هو تاريخ إنشاء الملف في Drive (تاريخ الرفع)، وليس تاريخ التقاط الصورة.

## أين يوضع كل شيء

| المعلومة | أين | سرية؟ |
|---|---|---|
| Client ID | `config.js` **و** Script Properties (`CLIENT_ID`) | لا (عام بطبيعته) |
| رابط Web App (`/exec`) | `config.js` | لا |
| Folder ID | Script Properties (`FOLDER_ID`) | نعم، لا تضعه في GitHub |
| الإيميلات المسموحة | Script Properties (`ALLOWED_EMAILS`) | نعم، لا تضعها في GitHub |
| Client Secret / Private Key / Tokens | **لا شيء منها مطلوب في هذا المشروع** | — |

## الخطوات

### 1) مجلد Google Drive
*لماذا:* مصدر الصور الوحيد.
1. في Drive أنشئ مجلد `Family Photos` وبداخله مجلدات السنوات (`2024`, `2025`…). الصور مباشرة في المجلد الرئيسي تعمل أيضًا.
2. **لا تشاركه مع أحد ولا تجعله عامًا.**
3. افتح المجلد وانسخ الـ ID من الرابط: `drive.google.com/drive/folders/`**`هذا_هو_ID`**

### 2) Google OAuth
*لماذا:* ليتمكن زر "Sign in with Google" من إصدار ID Token للموقع.
1. ادخل إلى [console.cloud.google.com](https://console.cloud.google.com) وأنشئ مشروعًا باسم `bayt-alhana`.
2. **APIs & Services → OAuth consent screen**: النوع External، اسم التطبيق `بيت الهنا`، إيميلك للدعم والتواصل. لا تضف أي Scopes إضافية (الأساسية فقط: openid/email/profile).
3. اضغط **Publish app** ليصبح "In production". لا يحتاج مراجعة من Google لأنه لا يستخدم صلاحيات حساسة. (الحماية الفعلية هي القائمة المسموحة.)
4. **Credentials → Create Credentials → OAuth client ID → Web application**.
5. في **Authorized JavaScript origins** أضف (أصل فقط، بدون مسار):
   - `https://YOUR_GITHUB_USERNAME.github.io`
   - `http://localhost:8000` (للتجربة المحلية)
6. انسخ **Client ID** (لا تحتاج Client Secret إطلاقًا).

### 3) Apps Script
*لماذا:* الخلفية التي تتحقق من المستخدم وتقرأ Drive.
1. ادخل إلى [script.google.com](https://script.google.com) → New project باسم `bayt-alhana-api` (بنفس حسابك الذي يملك المجلد).
2. احذف الكود الافتراضي والصق محتوى `Code.gs`.
3. **Project Settings (⚙️) → Script Properties → Add**:
   - `CLIENT_ID` = الـ Client ID من الخطوة 2
   - `FOLDER_ID` = الـ ID من الخطوة 1
   - `ALLOWED_EMAILS` = `family1@gmail.com,family2@gmail.com,family3@gmail.com` (افصل بفاصلة، ويجب أن يكون حسابك أنت بينها)

### 4) نشر Apps Script
1. **Deploy → New deployment → Web app**.
2. Execute as: **Me** ← Who has access: **Anyone**.
3. اضغط Deploy ووافق على الصلاحيات (ستظهر "Google hasn't verified this app": اضغط Advanced ثم Go to ... — طبيعي لأنه سكربتك الخاص).
4. انسخ **Web app URL** (ينتهي بـ `/exec`).
5. عند أي تعديل لاحق على الكود: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (الرابط لا يتغير).

### 5) ربط الموقع
افتح `config.js` وضع `CLIENT_ID` و `API_URL`.

### 6) النشر على GitHub Pages
1. أنشئ مستودع `family-gallery` وارفع الملفات: `index.html`, `style.css`, `app.js`, `config.js`, `README.md`. (مجلد Apps Script لا يلزم رفعه.)
2. **Settings → Pages → Deploy from a branch → main / (root) → Save**.
3. بعد دقيقة يعمل الموقع على `https://YOUR_GITHUB_USERNAME.github.io/family-gallery/`.
4. لا يوجد أي سر في المستودع، فيمكن أن يكون عامًا (المستودع الخاص يحتاج خطة مدفوعة لـ Pages).

## الاختبار

**تسجيل الدخول:** افتح الموقع ← اضغط Sign in with Google ← بحساب مسموح ← يظهر اسمك وصورتك والمعرض.

**الصلاحيات:**
1. افتح نافذة خاصة وسجّل بحساب Gmail غير موجود في القائمة ← يجب أن تظهر "هذا الحساب غير مصرح له بالدخول." ولا تظهر أي صورة.
2. اختبر الخادم مباشرة (يجب أن يرد `{"error":"auth"}`):
   `curl -L -X POST "رابط_EXEC" -H "Content-Type: text/plain" -d '{"action":"list","token":"x"}'`
3. افتح رابط `/exec` في المتصفح ← يجب أن يعرض `{"error":"auth"}` فقط.
4. أزل إيميلًا من `ALLOWED_EMAILS` ← يُمنع في الطلب التالي مباشرة.
5. انتهاء الجلسة (بعد ساعة تقريبًا) يعيدك إلى شاشة الدخول مع رسالة واضحة.

## إضافة الصور
ارفع الصور (JPG/JPEG/PNG/WEBP) إلى `Family Photos` أو أي مجلد فرعي، ثم حدّث صفحة الموقع. تظهر تلقائيًا دون تعديل الكود. الملفات غير الصورية تُتجاهل.

## ميزات لاحقة (الأساس جاهز لها)
الخادم يعيد لكل صورة `date` و`folder`، فالتصنيف حسب السنة أو المجلد أو البحث يمكن إضافتها في `app.js` فقط.
