-- ملاحظة 4: مسارات المتابعة المفعّلة لكل مركز.
--
-- الحفظ دائمًا. الباقي (المراجعة، التلاوة، التلقين، العربية، التربية، الاختبارات) يفعّله المركز من
-- «الإدارة ← بيانات المركز». الافتراضي لأي مركز: الحفظ + المراجعة. المسار غير المفعّل يختفي من
-- الواجهة ومن رابط وليّ الأمر، وبياناته تبقى كما هي في الجداول (لا يُحذف شيء).
-- talqeen_label: اسم آخر للتلقين إن أراده المركز (مثل «التسميع»).

alter table public.centers
  add column enabled_tracks text[] not null default array['HIFZ', 'MURAJAA']::text[],
  add column talqeen_label text;

alter table public.centers
  add constraint centers_enabled_tracks_check check (
    'HIFZ' = any (enabled_tracks)
    and enabled_tracks <@ array['HIFZ', 'MURAJAA', 'TILAWA', 'TALQEEN', 'ARABIC', 'TARBIYA', 'EXAMS']::text[]),
  add constraint centers_talqeen_label_check check (talqeen_label is null or char_length(btrim(talqeen_label)) between 2 and 30);

-- مدير المركز يغيّرهما (سياسة centers_update تحصر التعديل بمركزه وبالمدير).
grant update (enabled_tracks, talqeen_label) on public.centers to authenticated;

-- my_context: يعيد المسارات المفعّلة واسم التلقين مع بيانات المركز.
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
                 'enabled_tracks', to_jsonb(c.enabled_tracks), 'talqeen_label', c.talqeen_label)
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

-- guardian_view: رابط وليّ الأمر لا يعرض إلا المسارات المفعّلة (والاختبارات إن فُعّلت).
CREATE OR REPLACE FUNCTION public.guardian_view(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_student public.students;
  v_circle public.circles;
  v_center public.centers;
  v_today date;
  v_since date;
  v_month date;
  v_week date;
begin
  if p_token is null or char_length(p_token) < 32 then
    return null;
  end if;
  select s.* into v_student
  from public.guardian_links g join public.students s on s.id = g.student_id
  where g.token = p_token and s.deleted_at is null and s.active;
  if not found then
    return null;
  end if;
  select * into v_center from public.centers where id = v_student.center_id and status <> 'SUSPENDED';
  if not found then
    return null;
  end if;
  v_today := (now() at time zone v_center.timezone)::date;
  v_since := v_today - 13;
  v_month := v_today - 29;
  select * into v_circle from public.circles where id = v_student.circle_id;
  select v_today - ((extract(dow from v_today)::int - coalesce(week_start, 6) + 7) % 7) into v_week
  from public.ranking_settings where center_id = v_student.center_id;
  v_week := coalesce(v_week, v_today - ((extract(dow from v_today)::int - 6 + 7) % 7));

  if not exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.center_id = v_student.center_id) then
    update public.guardian_links
    set last_opened_at = now(), open_count = open_count + 1, updated_at = now()
    where student_id = v_student.id;
  end if;

  return jsonb_build_object(
    'center', jsonb_build_object('name', v_center.name, 'slug', v_center.slug, 'logo_url', v_center.logo_url,
                                 'palette', v_center.palette, 'primary_color', v_center.primary_color,
                                 'enabled_tracks', to_jsonb(v_center.enabled_tracks), 'talqeen_label', v_center.talqeen_label),
    'student', jsonb_build_object('name', v_student.name, 'circle', v_circle.name, 'section', v_circle.section),
    'surahs', (select jsonb_agg(jsonb_build_object('surah_no', surah_no, 'name', name, 'ayah_count', ayah_count) order by surah_no)
               from public.quran_surahs),
    'hifz', coalesce((
      select jsonb_agg(jsonb_build_object('entry_date', q.entry_date, 'from_surah_no', q.from_surah_no, 'from_ayah', q.from_ayah,
                                          'to_surah_no', q.to_surah_no, 'to_ayah', q.to_ayah) order by q.entry_date)
      from public.quran_entries q
      where q.student_id = v_student.id and q.deleted_at is null and q.track = 'HIFZ'), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('entry_date', q.entry_date, 'track', q.track, 'from_surah_no', q.from_surah_no,
                                          'from_ayah', q.from_ayah, 'to_surah_no', q.to_surah_no, 'to_ayah', q.to_ayah,
                                          'quality', q.quality) order by q.entry_date desc, q.created_at)
      from public.quran_entries q
      where q.student_id = v_student.id and q.deleted_at is null and q.entry_date >= v_since
        and q.track = any (v_center.enabled_tracks)), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('att_date', a.att_date, 'status', a.status) order by a.att_date desc)
      from public.attendance a
      where a.student_id = v_student.id and a.deleted_at is null and a.att_date >= v_month), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('lesson_date', l.lesson_date, 'title', l.title) order by l.lesson_date desc)
      from public.circle_lessons l
      where l.circle_id = v_student.circle_id and l.deleted_at is null and l.lesson_date >= v_since), '[]'::jsonb),
    'goal', case when v_student.weekly_goal_ayahs is null then null else jsonb_build_object(
      'weekly_ayahs', v_student.weekly_goal_ayahs,
      'done', (select count(distinct i)
               from public.quran_entries q,
                    generate_series(public.ayahs_before(q.from_surah_no) + q.from_ayah, public.ayahs_before(q.to_surah_no) + q.to_ayah) i
               where q.student_id = v_student.id and q.deleted_at is null and q.track = 'HIFZ' and q.entry_date >= v_week)) end,
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('exam_date', x.exam_date, 'kind', x.kind, 'juz_no', x.juz_no, 'surah_no', x.surah_no,
                                          'score', x.score, 'passed', x.passed) order by x.exam_date desc)
      from (select * from public.exams where student_id = v_student.id and deleted_at is null
              and 'EXAMS' = any (v_center.enabled_tracks)
            order by exam_date desc, created_at desc limit 10) x), '[]'::jsonb)
  );
end $$;


--
-- Name: invite_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.invite_info(p_token text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('center', c.name, 'slug', c.slug, 'logo_url', c.logo_url, 'palette', c.palette,
                            'role', i.role, 'email', i.email, 'name', i.name,
                            'state', case when i.revoked_at is not null then 'REVOKED' when i.accepted_at is not null then 'USED'
                                          when i.expires_at < now() then 'EXPIRED' else 'OK' end)
  from public.center_invites i join public.centers c on c.id = i.center_id
  where p_token is not null and char_length(p_token) >= 32 and i.token = p_token
$$;
