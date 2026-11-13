// The demo's starting point: the login accounts and two empty centres — no circles, no students, no
// records. Whoever tries the demo adds their own circles and students (or registers a new centre),
// exactly like a real centre on its first day. Nothing here is real.

export const DEMO_PASSWORD = "demo1234";
export const DEMO_CODE = "123456";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_USERS = {
  admin: { id: U(1), email: "admin@demo.com", name: "مدير مركز النور (تجريبي)" },
  teacher: { id: U(2), email: "teacher@demo.com", name: "معلّمة تجريبية" },
  doha: { id: U(3), email: "doha@demo.com", name: "صاحب مركز الدوحة" },
  both: { id: U(4), email: "both@demo.com", name: "معلّم في مركزين" },
  super: { id: U(5), email: "super@demo.com", name: "إدارة المنصة" },
};
const DOHA = "00000000-0000-4000-8000-00000000d0a1";
const NOOR = "00000000-0000-4000-8000-00000000a001";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function seedSql(): string {
  const u = DEMO_USERS;
  const out: string[] = [];
  out.push(`insert into auth.users (id, email, raw_user_meta_data) values
    ${Object.values(u).map((x) => `(${q(x.id)}, ${q(x.email)}, jsonb_build_object('name', ${q(x.name)}))`).join(",\n    ")};`);
  out.push(`insert into public.centers (id, slug, name, country, city, about, contact_email, palette, status, plan, onboarded, owner_id, extra_notes)
    values (${q(NOOR)}, 'noor', 'مركز النور لتحفيظ القرآن (تجريبي)', 'الأردن', 'عمّان',
      'مركز تجريبي على منصة منارات لتجربة المنصة.', 'info@noor.demo', 'navy', 'ACTIVE', 'FREE', false, ${q(u.admin.id)},
      'هذه نسخة تجريبية. ادخل بالبريد admin@demo.com وكلمة المرور demo1234 (أو الرمز 123456).'),
    (${q(DOHA)}, 'doha', 'مركز الدوحة لتحفيظ القرآن (تجريبي)', 'قطر', 'الدوحة',
      'مركز تجريبي ثانٍ لتجربة عزل البيانات: لا يرى أي مركز بيانات غيره.', 'info@doha.demo', 'navy', 'ACTIVE', 'FREE', false, ${q(u.doha.id)}, null);
    insert into public.ranking_settings (center_id) values (${q(NOOR)}), (${q(DOHA)});`);
  out.push(`insert into public.app_users (id, name, current_center_id) values
    (${q(u.admin.id)}, ${q(u.admin.name)}, ${q(NOOR)}), (${q(u.teacher.id)}, ${q(u.teacher.name)}, ${q(NOOR)}),
    (${q(u.doha.id)}, ${q(u.doha.name)}, ${q(DOHA)}), (${q(u.both.id)}, ${q(u.both.name)}, ${q(NOOR)}),
    (${q(u.super.id)}, ${q(u.super.name)}, null);`);
  out.push(`insert into public.platform_admins (user_id) values (${q(u.super.id)});`);
  out.push(`insert into public.memberships (user_id, center_id, name, role, is_owner, default_filter) values
    (${q(u.admin.id)}, ${q(NOOR)}, ${q(u.admin.name)}, 'ADMIN', true, null),
    (${q(u.teacher.id)}, ${q(NOOR)}, ${q(u.teacher.name)}, 'TEACHER', false, null),
    (${q(u.doha.id)}, ${q(DOHA)}, ${q(u.doha.name)}, 'ADMIN', true, null),
    (${q(u.both.id)}, ${q(NOOR)}, ${q(u.both.name)}, 'TEACHER', false, null),
    (${q(u.both.id)}, ${q(DOHA)}, ${q(u.both.name)}, 'TEACHER', false, null);`);
  return out.join("\n");
}
