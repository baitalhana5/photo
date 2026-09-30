/**
 * بيت الهنا - Backend (Google Apps Script)
 *
 * الإعدادات السرية/الخاصة تُحفظ في: Project Settings > Script Properties
 *   CLIENT_ID      = OAuth Client ID (نفس الموجود في config.js)
 *   FOLDER_ID      = معرّف مجلد الصور في Drive
 *   ALLOWED_EMAILS = family1@gmail.com,family2@gmail.com,family3@gmail.com
 *
 * النشر: Execute as = Me ، Who has access = Anyone
 * (الحماية ليست في الرابط، بل في التحقق من توكن Google ثم القائمة المسموحة في كل طلب).
 */

const P = PropertiesService.getScriptProperties();
const MIMES = ['image/jpeg', 'image/png', 'image/webp']; // JPG/JPEG/PNG/WEBP

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const user = verifyToken_(req.token);
    if (!user) return out_({ error: 'auth' });
    if (!isAllowed_(user.email)) return out_({ error: 'forbidden' });

    switch (req.action) {
      case 'list':
        return out_({ user: { name: user.name, picture: user.picture }, photos: listPhotos_() });
      case 'thumb':
      case 'full':
        return out_(getImage_(String(req.id), req.action));
      default:
        return out_({ error: 'bad_request' });
    }
  } catch (err) {
    console.error(err); // التفاصيل تبقى في سجل Apps Script فقط
    return out_({ error: 'server' });
  }
}

function doGet() { return out_({ error: 'auth' }); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- 1) التحقق من هوية المستخدم ----------
function verifyToken_(token) {
  if (!token || typeof token !== 'string' || token.length > 4000) return null;

  const cache = CacheService.getScriptCache();
  const key = 'v' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const r = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null; // توكن غير صالح أو منتهي

  const t = JSON.parse(r.getContentText());
  const okIssuer = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== P.getProperty('CLIENT_ID') || !okIssuer || String(t.email_verified) !== 'true') return null;

  const ttl = Math.min(300, Number(t.exp) - Math.floor(Date.now() / 1000));
  if (!(ttl > 0)) return null;

  const user = { email: String(t.email).toLowerCase(), name: t.name || t.email, picture: t.picture || '' };
  cache.put(key, JSON.stringify(user), ttl); // نخزّن الهوية فقط، أما الصلاحية فتُفحص في كل طلب
  return user;
}

// ---------- 2) القائمة المسموحة ----------
function isAllowed_(email) {
  const list = (P.getProperty('ALLOWED_EMAILS') || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return list.indexOf(email) !== -1;
}

// ---------- 3) قراءة الصور من Drive ----------
function listPhotos_() {
  const q = 'trashed=false and (' + MIMES.map(function (m) { return "mimeType='" + m + "'"; }).join(' or ') + ')';
  const out = [];
  (function walk(folder, name) {
    const files = folder.searchFiles(q);
    while (files.hasNext()) {
      const f = files.next();
      // folder: جاهز لميزة "العرض حسب المجلد" لاحقًا
      out.push({ id: f.getId(), name: f.getName(), date: f.getDateCreated().getTime(), folder: name });
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) { const s = subs.next(); walk(s, s.getName()); }
  })(DriveApp.getFolderById(P.getProperty('FOLDER_ID')), '');
  out.sort(function (a, b) { return b.date - a.date; }); // الأحدث أولًا
  return out;
}

// يمنع طلب أي ملف خارج مجلد العائلة حتى لو عُرف الـ ID
function inRoot_(file) {
  const root = P.getProperty('FOLDER_ID');
  let level = [file];
  for (let d = 0; d < 8 && level.length; d++) {
    const next = [];
    for (let i = 0; i < level.length; i++) {
      const ps = level[i].getParents();
      while (ps.hasNext()) {
        const p = ps.next();
        if (p.getId() === root) return true;
        next.push(p);
      }
    }
    level = next;
  }
  return false;
}

function getImage_(id, kind) {
  const f = DriveApp.getFileById(id);
  if (!inRoot_(f) || MIMES.indexOf(f.getMimeType()) === -1) return { error: 'notfound' };

  let blob;
  if (kind === 'thumb') {
    blob = f.getThumbnail(); // مصغّرة صغيرة وسريعة للشبكة
  } else {
    // نسخة بعرض 1600px بدل الأصل الضخم
    const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
    const meta = JSON.parse(UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=thumbnailLink',
      { headers: auth }).getContentText());
    blob = meta.thumbnailLink
      ? UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+$/, '=s1600'), { headers: auth }).getBlob()
      : f.getBlob();
  }
  if (!blob) return { error: 'notfound' };
  return { src: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}
