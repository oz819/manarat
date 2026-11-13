-- ملاحظة 5: إرسال التقارير يكون للإدارة، لا لأولياء الأمور.
--
-- المعلّم يرسل تقرير الحلقة إلى إدارة المركز داخل التطبيق بزر واحد («إرسال للإدارة»)، والمدير يراه
-- في «الإدارة ← التقارير الواردة». إرسال التقارير لوليّ الأمر عبر واتساب صار خيارًا تفعّله الإدارة
-- (centers.guardian_whatsapp)، وهو مُطفأ افتراضيًا. لا يُحذف شيء (report_sends يبقى كما هو).

alter table public.centers add column guardian_whatsapp boolean not null default false;
grant update (guardian_whatsapp) on public.centers to authenticated;

create table public.circle_reports (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null default private.current_center_id() references public.centers(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  -- What the report covers, as the teacher saw it: «حلقة أبي بكر»، «قسم الإناث»، «جميع الحلقات».
  scope_label text not null check (char_length(scope_label) between 1 and 120),
  kind text not null default 'DAILY' check (kind in ('DAILY', 'RANGE', 'MONTHLY')),
  period_from date not null,
  period_to date not null,
  body text not null check (char_length(body) between 1 and 20000),
  sent_by uuid not null default auth.uid() references auth.users(id),
  sent_by_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid,
  check (period_to >= period_from)
);
create index idx_circle_reports_center on public.circle_reports (center_id, created_at desc);
alter table public.circle_reports enable row level security;

create policy circle_reports_same_center on public.circle_reports as restrictive to authenticated
  using (center_id = (select private.current_center_id())) with check (center_id = (select private.current_center_id()));
-- المعلّم يرى ما أرسله هو، والمدير يرى كل تقارير مركزه.
create policy circle_reports_select on public.circle_reports for select to authenticated
  using (sent_by = auth.uid() or (select private.is_admin()));
create policy circle_reports_insert on public.circle_reports for insert to authenticated
  with check ((select private.is_staff()) and sent_by = auth.uid() and read_at is null);
-- المدير يعلّم التقرير «مقروءًا» فقط.
create policy circle_reports_update on public.circle_reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create trigger trg_same_center before insert or update on public.circle_reports
  for each row execute function private.check_same_center('circle_id', 'circles');

revoke all on public.circle_reports from anon, authenticated;
grant select, insert on public.circle_reports to authenticated;
grant update (read_at, read_by) on public.circle_reports to authenticated;
grant all on public.circle_reports to service_role;

-- my_context: يعيد خيار إرسال التقارير لأولياء الأمور.
CREATE OR REPLACE FUNCTION public.my_context() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_center uuid := private.current_center_id();
  v_out jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select jsonb_build_object(
    'user_id', v_uid,
    'name', (select name from public.app_users where id = v_uid),
    'is_platform_admin', private.is_platform_admin(),
    'center', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'logo_url', c.logo_url, 'palette', c.palette,
                 'primary_color', c.primary_color, 'about', c.about, 'status', c.status, 'plan', c.plan, 'onboarded', c.onboarded,
                 'timezone', c.timezone, 'locale', c.locale, 'trial_ends_at', c.trial_ends_at,
                 'enabled_tracks', to_jsonb(c.enabled_tracks), 'talqeen_label', c.talqeen_label,
                 'guardian_whatsapp', c.guardian_whatsapp)
               from public.centers c where c.id = v_center),
    'membership', (select jsonb_build_object('role', m.role, 'is_owner', m.is_owner, 'active', m.active, 'name', m.name,
                     'default_filter', m.default_filter)
                   from public.memberships m where m.user_id = v_uid and m.center_id = v_center),
    'centers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'role', m.role,
                           'status', c.status, 'active', m.active and m.deleted_at is null) order by m.created_at)
                         from public.memberships m join public.centers c on c.id = m.center_id
                         where m.user_id = v_uid and m.deleted_at is null), '[]'::jsonb),
    -- Why there is no current centre, so the app can say it plainly.
    'blocked', case
      when v_center is not null then null
      when exists (select 1 from public.memberships m join public.centers c on c.id = m.center_id
                   where m.user_id = v_uid and m.deleted_at is null and m.active and c.status = 'SUSPENDED') then 'SUSPENDED'
      when exists (select 1 from public.memberships m where m.user_id = v_uid and m.deleted_at is not null) then 'DELETED'
      when exists (select 1 from public.memberships m where m.user_id = v_uid and not m.active) then 'DISABLED'
      else 'NO_CENTER' end
  ) into v_out;
  return v_out;
end $$;


--
-- Name: public_center(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.public_center(p_slug text DEFAULT NULL::text, p_domain text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'country', c.country, 'city', c.city,
    'logo_url', c.logo_url, 'palette', c.palette, 'primary_color', c.primary_color, 'about', c.about,
    'contact_phone', c.contact_phone, 'contact_email', c.contact_email, 'whatsapp', c.whatsapp,
    'instagram', c.instagram, 'facebook', c.facebook, 'address', c.address, 'locale', c.locale, 'extra_notes', c.extra_notes,
    'registrations_open', c.registrations_open,
    'honor_enabled', coalesce((select r.honor_enabled from public.ranking_settings r where r.center_id = c.id), false))
  from public.centers c
  where c.status <> 'SUSPENDED'
    and ((p_slug is not null and c.slug = lower(p_slug)) or (p_slug is null and p_domain is not null and c.domain = lower(p_domain)))
  limit 1
$$;
