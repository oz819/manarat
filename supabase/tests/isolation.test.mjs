// Isolation and permission tests for منارات, on a real Postgres (PGlite, in process, no network).
// Builds the schema from supabase/migrations, fills a first centre (مركز النور) as its admin would,
// then checks that no centre can see or touch another centre's data.
//
//   node supabase/tests/isolation.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const MIGRATIONS = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const NOOR = "00000000-0000-4000-8000-00000000a001";
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = U(1), TEACHER = U(2), OWNER_B = U(3), BOTH = U(4), STRANGER = U(5), SUPER = U(6), TEACHER_B = U(7);

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log("  ✓", name); }
  else { failed++; console.log("  ✗", name); }
}

export async function setup() {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, "auth_stub.sql"), "utf8"));
  for (const f of MIGRATIONS) await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  // A new platform is empty: no centre, no people, no records — only the Mushaf's reference data.
  const fresh = (await db.query(`select (select count(*) from public.centers)::int centers, (select count(*) from public.students)::int students,
    (select count(*) from public.circles)::int circles, (select count(*) from public.memberships)::int members,
    (select count(*) from public.quran_surahs)::int surahs`)).rows[0];
  // The first centre and its two accounts, then its data entered by its admin through RLS.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@alnoor.test'), ('${TEACHER}', 'teacher@alnoor.test'), ('${OWNER_B}', 'owner@qatar.test'),
      ('${BOTH}', 'both@test.test'), ('${STRANGER}', 'nobody@test.test'), ('${SUPER}', 'super@manarat.test'),
      ('${TEACHER_B}', 'teacher@qatar.test');
    insert into public.centers (id, slug, name, country, city, owner_id, domain)
      values ('${NOOR}', 'alnoor', 'مركز النور', 'الأردن', 'عمّان', '${ADMIN}', 'alnoor.example');
    insert into public.ranking_settings (center_id) values ('${NOOR}');
    insert into public.app_users (id, name, current_center_id) values
      ('${ADMIN}', 'مدير النور', '${NOOR}'), ('${TEACHER}', 'محفظ النور', '${NOOR}');
    insert into public.memberships (user_id, center_id, name, role, is_owner) values
      ('${ADMIN}', '${NOOR}', 'مدير النور', 'ADMIN', true), ('${TEACHER}', '${NOOR}', 'محفظ النور', 'TEACHER', false);
    insert into public.platform_admins (user_id) values ('${SUPER}');
  `);
  await as(db, ADMIN, `
    insert into public.circles (id, name, section) values ('${U(100)}', 'حلقة أبي بكر', 'MALE'), ('${U(101)}', 'حلقة خديجة', 'FEMALE');
    insert into public.students (id, name, circle_id, guardian_phone) values
      ('${U(200)}', 'أحمد', '${U(100)}', '0991234567'), ('${U(201)}', 'مريم', '${U(101)}', null);
    insert into public.quran_entries (student_id, track, from_surah_no, from_ayah, to_surah_no, to_ayah) values ('${U(200)}', 'HIFZ', 1, 1, 1, 7);
    insert into public.attendance (student_id, att_date, status) values ('${U(200)}', current_date, 'PRESENT');
    insert into public.arabic_books (id, title, total_pages) values ('${U(300)}', 'الرشيدي', 120);
  `);
  await as(db, null, `select public.submit_registration('طالب جديد', 9, 'MALE', null, '0990000000', null, null, 'alnoor')`);
  return { db, fresh };
}

// Run a query as a signed-in user (or anon when uid is null), like PostgREST does.
async function as(db, uid, sql, params = []) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try {
    return params.length || !sql.includes(";") ? await db.query(sql, params) : (await db.exec(sql)).at(-1);
  } finally {
    await db.exec("reset role");
  }
}
async function fails(db, uid, sql, params = []) {
  try {
    await as(db, uid, sql, params);
    return false;
  } catch (e) {
    return e.message || true;
  }
}
const rows = async (db, uid, sql, params) => (await as(db, uid, sql, params)).rows;
const one = async (db, uid, sql, params) => (await rows(db, uid, sql, params))[0];

async function main() {
  const { db, fresh } = await setup();

  console.log("المنصة تبدأ فارغة");
  ok(fresh.centers === 0 && fresh.students === 0 && fresh.circles === 0 && fresh.members === 0, "لا مراكز ولا طلاب ولا حلقات ولا أعضاء بعد الترحيل");
  ok(fresh.surahs === 114, "سور المصحف الـ114 فقط (بيانات مرجعية)");

  console.log("أول مركز يُنشأ ويُدخل بياناته");
  for (const t of ["circles", "students", "quran_entries", "attendance", "arabic_books", "registration_requests"]) {
    const r = (await db.query(`select count(*) filter (where center_id is distinct from '${NOOR}')::int bad, count(*)::int n from public.${t}`)).rows[0];
    ok(r.bad === 0 && r.n > 0, `${t}: ${r.n} صف كلها لمركز النور (center_id يُملأ تلقائيًا)`);
  }

  console.log("مركز النور يعمل");
  ok((await rows(db, ADMIN, "select * from public.profiles")).length === 2, "المدير يرى حسابَي المركز في profiles");
  ok((await one(db, ADMIN, "select role from public.profiles where id = $1", [ADMIN])).role === "ADMIN", "دور المدير محفوظ");
  ok((await rows(db, TEACHER, "select * from public.students")).length === 2, "المحفظ يرى طلاب مركزه");
  ok((await one(db, TEACHER, "select private.is_staff() s, private.is_admin() a")).a === false, "المحفظ ليس مديرًا");
  await as(db, TEACHER, `insert into public.attendance (student_id, att_date, status) values ('${U(201)}', current_date, 'ABSENT')`);
  ok((await one(db, ADMIN, `select center_id from public.attendance where student_id = '${U(201)}'`)).center_id === NOOR, "سجل جديد يأخذ مركز المستخدم تلقائيًا");
  ok((await rows(db, ADMIN, "select * from public.ranking_settings where id = 1")).length === 1, "إعدادات المركز تُقرأ (id = 1)");
  ok((await rows(db, STRANGER, "select * from public.students")).length === 0, "حساب بلا مركز لا يرى شيئًا");
  ok((await one(db, STRANGER, "select public.my_context() c")).c.blocked === "NO_CENTER", "my_context يقول: لا مركز");

  console.log("تسجيل مركز جديد (قطر)");
  const created = (await one(db, OWNER_B, `select public.create_center('مركز الدوحة', 'doha', 'قطر', 'الدوحة', 'صاحب المركز') c`)).c;
  const B = created.id;
  ok(!!B && created.slug === "doha", "create_center أنشأ المركز");
  const ctxB = (await one(db, OWNER_B, "select public.my_context() c")).c;
  ok(ctxB.center.id === B && ctxB.membership.role === "ADMIN" && ctxB.membership.is_owner, "صاحب البريد صار مدير المركز (Owner)");
  ok(ctxB.center.status === "ACTIVE" && ctxB.center.trial_ends_at === null, "المركز الجديد فعّال مباشرة بلا فترة تجربة");
  ok(!!(await fails(db, OWNER_B, `select public.create_center('x', 'alnoor', 'a', 'b', 'c')`)), "لا يمكن أخذ رابط مستخدم");
  ok(!!(await fails(db, OWNER_B, `select public.create_center('x', 'login', 'a', 'b', 'c')`)), "لا يمكن أخذ رابط محجوز");
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${U(9)}', 'unconfirmed@test.test', null)`);
  ok(!!(await fails(db, U(9), `select public.create_center('x', 'xyz', 'a', 'b', 'c')`)), "لا مركز قبل تأكيد البريد");
  ok((await rows(db, OWNER_B, "select * from public.students")).length === 0, "المركز الجديد لا يرى طلاب مركز النور");
  ok((await rows(db, OWNER_B, "select * from public.profiles")).length === 1, "ولا حسابات مركز النور");
  ok((await rows(db, OWNER_B, "select * from public.ranking_settings where id = 1")).length === 1, "وله إعداداته الخاصة");
  ok((await rows(db, OWNER_B, "select * from public.arabic_books")).length === 0, "ولا كتب مركز النور");
  ok((await rows(db, OWNER_B, "select * from public.registration_requests")).length === 0, "ولا طلبات تسجيل مركز النور");
  ok((await rows(db, OWNER_B, "select * from public.audit_log")).every((r) => r.center_id === B), "ولا سجل تعديلات مركز النور");
  ok((await rows(db, OWNER_B, "select * from public.centers")).length === 1, "ولا يرى إلا مركزه في centers");

  await as(db, OWNER_B, `insert into public.circles (id, name, section) values ('${U(110)}', 'حلقة أبي بكر', 'MALE')`);
  ok(true, "اسم حلقة مكرر مسموح بين مركزين (فريد داخل المركز فقط)");
  await as(db, OWNER_B, `insert into public.students (id, name, circle_id) values ('${U(210)}', 'عبد الله', '${U(110)}')`);
  await as(db, OWNER_B, `insert into public.arabic_books (id, title, total_pages) values ('${U(310)}', 'الرشيدي', 80)`);
  ok((await rows(db, ADMIN, `select * from public.students where id = '${U(210)}'`)).length === 0, "مركز النور لا يرى طلاب الدوحة");
  ok((await rows(db, ADMIN, `select * from public.circles`)).length === 2, "ولا حلقاتها");

  console.log("محاولات الوصول عبر المراكز (يجب أن تفشل كلها)");
  ok(!!(await fails(db, OWNER_B, `insert into public.attendance (student_id, att_date, status) values ('${U(200)}', current_date, 'ABSENT')`)), "تسجيل حضور لطالب من مركز آخر");
  ok(!!(await fails(db, OWNER_B, `insert into public.students (name, circle_id) values ('دخيل', '${U(100)}')`)), "إضافة طالب في حلقة مركز آخر");
  ok(!!(await fails(db, OWNER_B, `insert into public.circles (name, center_id) values ('حلقة', '${NOOR}')`)), "إدخال صف بـ center_id لمركز آخر");
  ok(!!(await fails(db, OWNER_B, `insert into public.quran_entries (student_id, track, from_surah_no, from_ayah, to_surah_no, to_ayah) values ('${U(200)}', 'HIFZ', 2, 1, 2, 5)`)), "إضافة حفظ لطالب مركز آخر");
  ok(!!(await fails(db, OWNER_B, `insert into public.activities (title, activity_date, student_ids) values ('نشاط', current_date, array['${U(200)}'::uuid])`)), "نشاط فيه طالب من مركز آخر");
  ok((await as(db, OWNER_B, `update public.students set name = 'x' where id = '${U(200)}'`)).affectedRows === 0, "تعديل طالب مركز آخر لا يصيب شيئًا");
  ok(!!(await fails(db, OWNER_B, `update public.students set center_id = '${NOOR}' where id = '${U(210)}'`)), "نقل طالب إلى مركز آخر");
  ok((await as(db, OWNER_B, `update public.profiles set role = 'TEACHER' where id = '${ADMIN}'`)).affectedRows === 0, "تعديل حساب مدير مركز النور لا يصيب شيئًا");
  ok((await as(db, OWNER_B, `update public.centers set name = 'x' where id = '${NOOR}'`)).affectedRows === 0, "تعديل بيانات مركز آخر لا يصيب شيئًا");
  ok(!!(await fails(db, OWNER_B, `update public.centers set status = 'ACTIVE', plan = 'PRO' where id = '${B}'`)), "المركز لا يغيّر خطته أو حالته بنفسه");
  await as(db, OWNER_B, `select public.admin_soft_delete('student', '${U(200)}')`);
  ok((await one(db, ADMIN, `select deleted_at from public.students where id = '${U(200)}'`)).deleted_at === null, "admin_soft_delete لا يحذف طالب مركز آخر");
  await as(db, OWNER_B, `select public.admin_soft_delete('profile', '${TEACHER}')`);
  ok((await one(db, ADMIN, `select deleted_at from public.profiles where id = '${TEACHER}'`)).deleted_at === null, "ولا يحذف محفظ مركز آخر");
  ok((await rows(db, OWNER_B, "select * from public.admin_trash()")).every((r) => r.id !== U(200)), "admin_trash لا يعرض محذوفات مركز آخر");
  ok(!!(await fails(db, OWNER_B, `select public.rotate_guardian_link('${U(200)}')`)), "تغيير رابط ولي أمر طالب مركز آخر");
  ok(!!(await fails(db, OWNER_B, `select public.admin_accept_registration('${U(400)}', '${U(110)}')`)), "قبول طلب تسجيل لمركز آخر");
  ok(!!(await fails(db, OWNER_B, `select public.admin_reject_registration('${U(400)}')`)), "رفض طلب تسجيل لمركز آخر");
  ok(!!(await fails(db, OWNER_B, `select public.switch_center('${NOOR}')`)), "الانتقال لمركز لست عضوًا فيه");
  ok((await rows(db, OWNER_B, "select * from public.sync_latest_quran_entries()")).length === 0, "sync_latest_quran_entries لا يعيد بيانات مركز آخر");
  ok((await rows(db, OWNER_B, "select * from public.student_progress")).every((r) => r.student_id === U(210)), "student_progress لا يعيد بيانات مركز آخر");
  ok((await rows(db, OWNER_B, `select * from public.app_users where id = '${ADMIN}'`)).length === 0, "app_users لا يكشف حسابات مركز آخر");
  ok(!!(await fails(db, OWNER_B, "select public.super_centers()")), "لوحة المنصة ممنوعة على غير مديري المنصة");
  ok(!!(await fails(db, OWNER_B, `select private.audit_row()`)), "دوال الخادم الداخلية غير قابلة للاستدعاء");

  console.log("الدعوات والعضوية في أكثر من مركز");
  await as(db, OWNER_B, `insert into public.center_invites (email, role, name) values ('both@test.test', 'TEACHER', 'محفظ مشترك')`);
  await as(db, ADMIN, `insert into public.center_invites (email, role) values ('both@test.test', 'TEACHER')`);
  ok((await rows(db, ADMIN, "select * from public.center_invites")).length === 1, "كل مدير يرى دعوات مركزه فقط");
  const tokB = (await db.query(`select token from public.center_invites where center_id = '${B}'`)).rows[0].token;
  const tokM = (await db.query(`select token from public.center_invites where center_id = '${NOOR}'`)).rows[0].token;
  ok((await one(db, null, "select public.invite_info($1) i", [tokB])).i.center === "مركز الدوحة", "صفحة الدعوة تعرض اسم المركز للزائر");
  ok(!!(await fails(db, STRANGER, "select public.accept_invite($1)", [tokB])), "دعوة لبريد آخر لا تُقبل");
  await as(db, BOTH, "select public.accept_invite($1)", [tokB]);
  ok(!!(await fails(db, BOTH, "select public.accept_invite($1)", [tokB])), "رابط الدعوة يُستعمل مرة واحدة");
  await as(db, BOTH, "select public.accept_invite($1)", [tokM]);
  const ctxBoth = (await one(db, BOTH, "select public.my_context() c")).c;
  ok(ctxBoth.centers.length === 2 && ctxBoth.center.id === NOOR, "المستخدم نفسه عضو في مركزين (آخر دعوة = المركز الحالي)");
  ok((await rows(db, BOTH, "select * from public.students")).every((s) => s.center_id === NOOR), "يرى طلاب المركز الحالي فقط");
  await as(db, BOTH, `select public.switch_center('${B}')`);
  const seenB = await rows(db, BOTH, "select * from public.students");
  ok(seenB.length === 1 && seenB[0].center_id === B, "بعد التبديل يرى طلاب المركز الآخر فقط");
  ok((await one(db, BOTH, "select private.is_admin() a")).a === false, "محفظ في المركزين ليس مديرًا في أيّ منهما");
  ok((await as(db, BOTH, `update public.profiles set role = 'ADMIN' where id = '${BOTH}'`)).affectedRows === 0 ||
     !!(await fails(db, BOTH, `update public.profiles set role = 'ADMIN' where id = '${BOTH}'`)), "المحفظ لا يرقّي نفسه");
  await as(db, OWNER_B, `select public.admin_soft_delete('profile', '${BOTH}')`);
  ok((await db.query(`select banned_until from auth.users where id = '${BOTH}'`)).rows[0].banned_until === null, "حذفه من مركز لا يوقف حسابه في المركز الآخر");
  const ctxAfter = (await one(db, BOTH, "select public.my_context() c")).c;
  ok(ctxAfter.center.id === NOOR, "ويرجع تلقائيًا لمركزه الباقي");

  console.log("الأدوار داخل المركز");
  ok(!!(await fails(db, OWNER_B, `update public.profiles set role = 'TEACHER' where id = '${OWNER_B}'`)), "صاحب المركز لا يُخفَّض");
  await db.exec(`insert into public.app_users (id, name) values ('${TEACHER_B}', 'محفظة الدوحة');
                 insert into public.memberships (user_id, center_id, name, role) values ('${TEACHER_B}', '${B}', 'محفظة الدوحة', 'TEACHER')`);
  ok((await as(db, TEACHER_B, `update public.profiles set active = false where id = '${OWNER_B}'`)).affectedRows === 0, "المحفظ لا يعدّل الحسابات");
  ok(!!(await fails(db, TEACHER_B, `insert into public.circles (name) values ('حلقة جديدة')`)), "المحفظ لا ينشئ حلقات");
  ok(!!(await fails(db, TEACHER_B, `insert into public.center_invites (email) values ('a@b.cd')`)), "المحفظ لا يرسل دعوات");
  ok((await as(db, TEACHER_B, `update public.centers set name = 'x'`)).affectedRows === 0, "المحفظ لا يعدّل بيانات المركز");
  ok((await as(db, OWNER_B, `update public.centers set about = 'نبذة جديدة', palette = 'navy'`)).affectedRows === 1, "مدير المركز يعدّل نبذته وهويته");

  console.log("الصفحات العامة");
  const pub = (await one(db, null, "select public.public_center('doha') c")).c;
  ok(pub.name === "مركز الدوحة" && pub.about === "نبذة جديدة" && !("plan" in pub) && !("owner_id" in pub), "public_center يعرض البيانات العامة فقط");
  ok((await one(db, null, "select public.public_center(null, 'alnoor.example') c")).c.slug === "alnoor", "نطاق المركز الخاص يفتح صفحته");
  await as(db, null, `select public.submit_registration('طالب قطري', 10, 'MALE', null, '974555555', null, null, 'doha')`);
  ok(!!(await fails(db, null, `select public.submit_registration('طالب بلا مركز', 10, 'MALE', null, '0995555555', null)`)), "طلب بلا مركز مرفوض");
  ok((await rows(db, OWNER_B, "select * from public.registration_requests")).length === 1, "طلب التسجيل يصل للمركز المطلوب فقط");
  ok((await rows(db, ADMIN, "select * from public.registration_requests")).length === 1, "ولا يصل لغيره");
  ok(!!(await fails(db, null, "select * from public.students")) || (await rows(db, null, "select * from public.students")).length === 0, "الزائر لا يقرأ الجداول");
  const tokenB = (await db.query(`select token from public.guardian_links where student_id = '${U(210)}'`)).rows[0]?.token;
  const gv = (await one(db, null, "select public.guardian_view($1) v", [tokenB])).v;
  ok(gv?.center?.name === "مركز الدوحة" && gv.student.name === "عبد الله", "رابط ولي الأمر يعرض اسم مركز الطالب");

  console.log("إدارة المنصة");
  ok((await one(db, SUPER, "select jsonb_array_length(public.super_centers()) n")).n === 2, "مدير المنصة يرى كل المراكز");
  ok((await rows(db, SUPER, "select * from public.students")).length === 0, "لكنه لا يرى بيانات المراكز اليومية");
  await as(db, SUPER, `select public.super_set_center('${B}', 'SUSPENDED')`);
  ok((await rows(db, OWNER_B, "select * from public.students")).length === 0, "المركز الموقوف لا يصل لبياناته");
  ok((await one(db, OWNER_B, "select public.my_context() c")).c.blocked === "SUSPENDED", "ويُخبَر أن المركز موقوف");
  ok((await one(db, null, "select public.public_center('doha') c")).c === null, "وصفحته العامة تختفي");
  await as(db, SUPER, `select public.super_set_center('${B}', 'ACTIVE')`);
  ok((await rows(db, OWNER_B, "select * from public.students")).length === 1, "وبعد التفعيل يرجع كل شيء");

  console.log("مجاني بلا حدود");
  let limitErr = "";
  for (let i = 0; i < 70 && !limitErr; i++) {
    limitErr = (await fails(db, OWNER_B, `insert into public.students (name, circle_id) values ('طالب ${i}', '${U(110)}')`)) || "";
  }
  if (limitErr) console.log("    →", limitErr);
  ok(!limitErr, "لا حد لعدد الطلاب (70 طالبًا في المركز الجديد)");
  ok(!!(await fails(db, OWNER_B, `update public.centers set status = 'TRIAL' where id = '${B}'`)), "المركز لا يغيّر حالته بنفسه");

  console.log("سجل التعديلات");
  const auditB = await rows(db, OWNER_B, "select * from public.audit_log");
  ok(auditB.length > 0 && auditB.every((r) => r.center_id === B), "كل مركز له سجل تعديلاته");

  console.log("إشعارات Push");
  await as(db, ADMIN, `insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/a', 'k', 'a')`);
  ok((await rows(db, ADMIN, "select * from public.push_subscriptions")).length === 1, "الجهاز يحفظ اشتراكه");
  ok((await rows(db, TEACHER, "select * from public.push_subscriptions")).length === 0, "ولا يراه غيره ولو من نفس المركز");
  ok((await rows(db, OWNER_B, "select * from public.push_subscriptions")).length === 0, "ولا مركز آخر");
  ok(!!(await fails(db, OWNER_B, `insert into public.push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/b', 'k', 'a', '${ADMIN}')`)), "لا أحد يسجّل اشتراكًا باسم غيره");

  console.log("طلبات التسجيل: الحماية والمرونة");
  const reqB = () => rows(db, OWNER_B, "select * from public.registration_requests order by created_at");
  const nB = (await reqB()).length;
  await as(db, null, `select public.submit_registration('  سارة\u200f   أحمد ', 9, 'FEMALE', '<b>أبو سارة</b>', '+974 5555-1234', 'جزء عم', null, 'doha')`);
  let r = (await reqB()).at(-1);
  ok((await reqB()).length === nB + 1 && r.student_name === "سارة أحمد", "الاسم يُنظَّف من الرموز الخفية والمسافات");
  ok(r.guardian_phone === "97455551234", "الرقم يُوحَّد على الخادم (+974 5555-1234)");
  ok(!/[<>]/.test(r.guardian_name), "لا وسوم HTML في اسم ولي الأمر");
  await as(db, null, `select public.submit_registration('سارة أحمد', 9, 'FEMALE', null, '0097455551234', null, null, 'doha')`);
  ok((await reqB()).length === nB + 1, "الطلب المكرر (نفس الطالب والرقم) لا يُسجَّل مرتين");
  ok(/روابط/.test(await fails(db, null, `select public.submit_registration('علي', 9, 'MALE', null, '97455551299', 'https://spam.example', null, 'doha')`)), "لا روابط في الطلب");
  ok(!!(await fails(db, null, `select public.submit_registration('علي123', 9, 'MALE', null, '97455551299', null, null, 'doha')`)), "اسم الطالب حروف فقط");
  ok(!!(await fails(db, null, `select public.submit_registration('علي', 9, 'MALE', null, '12', null, null, 'doha')`)), "رقم قصير مرفوض");
  ok(!!(await fails(db, null, `select public.submit_registration('علي', 9, 'OTHER', null, '97455551299', null, null, 'doha')`)), "قسم غير معروف مرفوض");
  ok(!!(await fails(db, null, `select public.submit_registration('علي', 9, 'MALE', null, '97455551299', null, null, 'no-such')`)), "مركز غير موجود مرفوض");
  ok(!!(await fails(db, null, `insert into public.registration_requests (student_name, section, guardian_phone, center_id) values ('x y', 'MALE', '97455551299', '${B}')`)), "الزائر لا يكتب في الجدول مباشرة");
  ok(!!(await fails(db, OWNER_B, `update public.registration_requests set status = 'ACCEPTED'`)), "ولا المدير يغيّر الحالة إلا عبر القبول/الرفض");
  ok((await rows(db, null, "select 1 from public.registration_requests").catch(() => [])).length === 0, "الزائر لا يقرأ الطلبات");
  await as(db, OWNER_B, `update public.centers set registrations_open = false where id = '${B}'`);
  ok((await one(db, null, "select public.public_center('doha') c")).c.registrations_open === false, "المدير يغلق التسجيل وتعرف الصفحة العامة");
  ok(/مغلق/.test(await fails(db, null, `select public.submit_registration('خالد', 9, 'MALE', null, '97455551288', null, null, 'doha')`)), "والنموذج يرفض وهو مغلق");
  await as(db, OWNER_B, `update public.centers set registrations_open = true where id = '${B}'`);
  await as(db, null, `select public.submit_registration('حمزة', 9, 'MALE', null, '97455551277', null, null, 'doha')`);
  const hamza = (await reqB()).at(-1);
  await as(db, OWNER_B, `update public.circles set section = 'FEMALE' where id = '${U(110)}'`);
  ok(/قسم/.test(await fails(db, OWNER_B, `select public.admin_accept_registration('${hamza.id}', '${U(110)}')`)), "لا يُقبل طالب في حلقة من القسم الآخر");
  await as(db, OWNER_B, `update public.circles set section = null where id = '${U(110)}'`);
  ok(!(await fails(db, OWNER_B, `select public.admin_accept_registration('${hamza.id}', '${U(110)}')`)), "ويُقبل في حلقة بلا قسم");
  ok(!!(await fails(db, OWNER_B, `select public.admin_accept_registration('${hamza.id}', '${U(110)}')`)), "ولا يُقبل الطلب مرتين");

  console.log("إنشاء حلقة مع طلابها دفعة واحدة");
  const made = (await one(db, OWNER_B, `select public.admin_create_circle('حلقة عمر', 'MALE', '["يوسف علي", " يوسف  علي ", "", "x", "زيد\u202eعمرو", "بلال"]'::jsonb) c`)).c;
  const kids = await rows(db, OWNER_B, `select name from public.students where circle_id = '${made.id}' order by created_at`);
  ok(made.students === 3 && kids.length === 3, "تُحذف الأسطر الفارغة والقصيرة والمكررة (3 من 6)");
  ok(kids.every((k) => !/[\u202e]/.test(k.name)), "وتُنظَّف الأسماء");
  ok(/يوجد حلقة/.test(await fails(db, OWNER_B, `select public.admin_create_circle('حلقة عمر')`)), "اسم حلقة مكرر مرفوض برسالة واضحة");
  const before = (await rows(db, OWNER_B, "select id from public.circles")).length;
  ok(!!(await fails(db, OWNER_B, `select public.admin_create_circle('حلقة كبيرة', null, (select jsonb_agg('اسم ' || g) from generate_series(1, 301) g))`)), "أكثر من 300 اسم مرفوض");
  ok((await rows(db, OWNER_B, "select id from public.circles")).length === before, "ولا تبقى حلقة نصف منشأة");
  ok(!!(await fails(db, TEACHER, `select public.admin_create_circle('حلقة المعلم')`)), "المعلم لا ينشئ حلقات");
  ok(!!(await fails(db, null, `select public.admin_create_circle('حلقة الزائر')`)), "ولا الزائر");
  ok((await rows(db, ADMIN, `select * from public.circles where name = 'حلقة عمر'`)).length === 0, "حلقة المركز لا تظهر لمركز آخر");

  console.log("مسارات المتابعة المفعّلة (ملاحظة 4)");
  const ctxTracks = async (uid) => (await one(db, uid, "select public.my_context() c")).c.center;
  const cB = await ctxTracks(OWNER_B);
  ok(JSON.stringify(cB.enabled_tracks) === '["HIFZ","MURAJAA","TILAWA","TALQEEN","ARABIC","TARBIYA","EXAMS"]' && cB.talqeen_label === null, "الافتراضي لأي مركز: كل المسارات (مثل مضايا)");
  ok(!!(await fails(db, OWNER_B, `update public.centers set enabled_tracks = '{MURAJAA}' where id = '${B}'`)), "الحفظ لا يُطفأ");
  ok(!!(await fails(db, OWNER_B, `update public.centers set enabled_tracks = '{HIFZ,SOMETHING}' where id = '${B}'`)), "مسار غير معروف مرفوض");
  ok(!!(await fails(db, OWNER_B, `update public.centers set talqeen_label = 'x' where id = '${B}'`)), "اسم التلقين من حرفين على الأقل");
  ok((await as(db, TEACHER_B, `update public.centers set enabled_tracks = '{HIFZ,TALQEEN}'`)).affectedRows === 0, "المعلّم لا يغيّر المسارات");
  await as(db, OWNER_B, `insert into public.quran_entries (student_id, track, from_surah_no, from_ayah, to_surah_no, to_ayah) values
    ('${U(210)}', 'TALQEEN', 114, 1, 114, 6), ('${U(210)}', 'HIFZ', 113, 1, 113, 5)`);
  let gB = (await one(db, null, "select public.guardian_view($1) v", [tokenB])).v;
  ok(gB.recent.some((r) => r.track === "TALQEEN") && gB.recent.some((r) => r.track === "HIFZ"), "افتراضيًا رابط وليّ الأمر يعرض كل المسارات");
  await as(db, OWNER_B, `update public.centers set enabled_tracks = '{HIFZ,MURAJAA}' where id = '${B}'`);
  gB = (await one(db, null, "select public.guardian_view($1) v", [tokenB])).v;
  ok(gB.recent.every((r) => r.track !== "TALQEEN") && gB.recent.some((r) => r.track === "HIFZ"), "رابط وليّ الأمر لا يعرض مسارًا غير مفعّل");
  ok(gB.exams.length === 0 && JSON.stringify(gB.center.enabled_tracks) === '["HIFZ","MURAJAA"]', "ولا الاختبارات ما لم تُفعَّل");
  await as(db, OWNER_B, `update public.centers set enabled_tracks = '{HIFZ,MURAJAA,TALQEEN,EXAMS}', talqeen_label = 'التسميع' where id = '${B}'`);
  const cB2 = await ctxTracks(OWNER_B);
  ok(cB2.enabled_tracks.includes("TALQEEN") && cB2.talqeen_label === "التسميع", "المدير يفعّل التلقين ويسمّيه «التسميع»");
  gB = (await one(db, null, "select public.guardian_view($1) v", [tokenB])).v;
  ok(gB.recent.some((r) => r.track === "TALQEEN") && gB.center.talqeen_label === "التسميع", "وبعد التفعيل يظهر في رابط وليّ الأمر");
  ok(JSON.stringify((await ctxTracks(ADMIN)).enabled_tracks) === '["HIFZ","MURAJAA","TILAWA","TALQEEN","ARABIC","TARBIYA","EXAMS"]', "إعداد مركز لا يغيّر مركزًا آخر");
  ok((await as(db, ADMIN, `update public.centers set enabled_tracks = '{HIFZ}' where id = '${B}'`)).affectedRows === 0, "ولا يغيّره مدير مركز آخر");

  console.log("تقارير الحلقات للإدارة (ملاحظة 5)");
  const rep = (who, circle) => as(db, who, `insert into public.circle_reports (circle_id, scope_label, period_from, period_to, body, sent_by_name)
    values (${circle ? `'${circle}'` : "null"}, 'حلقة أبي بكر', current_date, current_date, 'تقرير اليوم', 'محفظ')`);
  await rep(TEACHER, U(100));
  ok((await rows(db, ADMIN, "select * from public.circle_reports")).length === 1, "المعلّم يرسل تقرير الحلقة ويصل إلى مدير مركزه");
  ok((await rows(db, OWNER_B, "select * from public.circle_reports")).length === 0, "ولا يراه مدير مركز آخر");
  ok(!!(await fails(db, TEACHER, `insert into public.circle_reports (scope_label, period_from, period_to, body, sent_by)
    values ('x', current_date, current_date, 'x', '${ADMIN}')`)), "لا أحد يرسل تقريرًا باسم غيره");
  ok(!!(await fails(db, OWNER_B, `insert into public.circle_reports (circle_id, scope_label, period_from, period_to, body)
    values ('${U(100)}', 'x', current_date, current_date, 'x')`)), "ولا تقريرًا عن حلقة مركز آخر");
  ok((await as(db, TEACHER, "update public.circle_reports set read_at = now()")).affectedRows === 0 ||
     !!(await fails(db, TEACHER, "update public.circle_reports set read_at = now()")), "المعلّم لا يعلّم التقرير مقروءًا");
  ok((await as(db, ADMIN, "update public.circle_reports set read_at = now(), read_by = auth.uid()")).affectedRows === 1, "المدير يعلّمه مقروءًا");
  ok(!!(await fails(db, ADMIN, "update public.circle_reports set body = 'تغيير'")), "ولا يغيّر أحد نص التقرير");
  ok(!!(await fails(db, null, "select * from public.circle_reports")) || (await rows(db, null, "select * from public.circle_reports")).length === 0, "الزائر لا يقرأ التقارير");
  ok((await ctxTracks(ADMIN)).guardian_whatsapp === false, "إرسال التقارير لأولياء الأمور مُطفأ افتراضيًا");
  ok((await as(db, TEACHER, "update public.centers set guardian_whatsapp = true")).affectedRows === 0, "المعلّم لا يفعّله");
  await as(db, ADMIN, `update public.centers set guardian_whatsapp = true where id = '${NOOR}'`);
  ok((await ctxTracks(ADMIN)).guardian_whatsapp === true && (await ctxTracks(OWNER_B)).guardian_whatsapp === false, "المدير يفعّله لمركزه فقط");

  console.log(`\n${passed} ناجح، ${failed} فاشل`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
