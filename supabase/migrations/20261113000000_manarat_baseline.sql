-- منارات — قاعدة البيانات كاملة (public + private) في ملف واحد: البنية فقط، بلا أي بيانات ولا مركز افتراضي.
--
-- Multi-centre: every row belongs to a centre (center_id), Row Level Security keeps each centre to
-- its own data, and the app talks to Postgres through PostgREST and the SECURITY DEFINER functions
-- below. Generated with pg_dump (schema only) from the schema the tests check; the platform starts
-- empty and each centre is created by its owner (create_center). The 114 surahs come in the next
-- migration. To make someone a platform admin after they sign up:
--   insert into public.platform_admins (user_id) select id from auth.users where email = '...';


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS private;




--
-- Name: audit_row(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.audit_row() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_skip text[] := array['updated_at', 'edited_at', 'updated_by', 'created_at', 'deleted_by', 'teacher_id', 'center_id'];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_action text := tg_op;
  v_key text := '';
  v_col text;
  k text;
  v_center uuid := coalesce((v_row ->> 'center_id')::uuid, private.current_center_id());
begin
  if v_center is null then
    return null;
  end if;
  foreach v_col in array tg_argv loop
    v_key := v_key || case when v_key = '' then '' else '|' end || coalesce(v_row ->> v_col, '');
  end loop;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_skip)) and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    if v_changes ? 'deleted_at' then
      v_action := case when v_new ->> 'deleted_at' is null then 'RESTORE' else 'DELETE' end;
    end if;
  else
    v_changes := jsonb_strip_nulls(v_row) - v_skip;
  end if;
  insert into public.audit_log (actor, table_name, row_key, student_id, action, changes, center_id)
  values (auth.uid(),
          case when tg_table_name = 'memberships' then 'profiles' else tg_table_name end,
          v_key,
          case when tg_table_name = 'students' then (v_row ->> 'id')::uuid else (v_row ->> 'student_id')::uuid end,
          v_action, v_changes, v_center);
  return null;
end $$;


--
-- Name: check_activity_students(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.check_activity_students() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from unnest(new.student_ids) sid
             where not exists (select 1 from public.students s where s.id = sid and s.center_id = new.center_id)) then
    raise exception 'لا يمكن ربط سجل بمركز آخر' using errcode = '42501';
  end if;
  return new;
end $$;


--
-- Name: check_same_center(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.check_same_center() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  i int := 0;
  v_col text;
  v_tbl text;
  v_id uuid;
  v_center uuid;
begin
  while i < coalesce(array_length(tg_argv, 1), 0) loop
    v_col := tg_argv[i];
    v_tbl := tg_argv[i + 1];
    v_id := (to_jsonb(new) ->> v_col)::uuid;
    if v_id is not null then
      execute format('select center_id from public.%I where id = $1', v_tbl) into v_center using v_id;
      if v_center is distinct from new.center_id then
        raise exception 'لا يمكن ربط سجل بمركز آخر' using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $_$;


--
-- Name: clean_text(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.clean_text(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select nullif(btrim(regexp_replace(
           regexp_replace(coalesce(p, ''), '[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿<>]', ' ', 'g'),
           '\s+', ' ', 'g')), '')
$$;


--
-- Name: create_guardian_link(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.create_guardian_link() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.guardian_links (student_id, center_id) values (new.id, new.center_id) on conflict (student_id) do nothing;
  return new;
end $$;


--
-- Name: current_center_id(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_center_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select m.center_id
  from public.memberships m join public.centers c on c.id = m.center_id
  where m.user_id = auth.uid() and m.active and m.deleted_at is null and c.status <> 'SUSPENDED'
  order by (m.center_id is not distinct from (select u.current_center_id from public.app_users u where u.id = auth.uid())) desc,
           m.created_at, m.center_id
  limit 1
$$;


--
-- Name: guard_membership(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_membership() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and old.is_owner and (new.role <> 'ADMIN' or not new.active or new.deleted_at is not null) then
    raise exception 'صاحب المركز يبقى مديرًا فعّالًا';
  end if;
  new.updated_at := now();
  return new;
end $$;


--
-- Name: guard_student_archive(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_student_archive() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if (tg_op = 'INSERT' and (not new.active or new.deleted_at is not null))
     or (tg_op = 'UPDATE' and (new.active is distinct from old.active or new.deleted_at is distinct from old.deleted_at)) then
    if not private.is_admin() then raise exception 'أرشفة الطلاب وحذفهم متاحان للمدير فقط'; end if;
  end if;
  return new;
end $$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.memberships
                 where user_id = auth.uid() and center_id = private.current_center_id()
                   and role = 'ADMIN' and active and deleted_at is null)
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;


--
-- Name: is_reserved_slug(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_reserved_slug(p_slug text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select p_slug = any (array['login','register','honor','p','api','auth','forgot-password','reset-password','admin','super',
    'signup','new','onboarding','invite','app','www','sb','static','images','icons','manifest','sw','_next','help','about',
    'pricing','terms','privacy','centers','center','manarat-demo'])
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.memberships
                 where user_id = auth.uid() and center_id = private.current_center_id()
                   and role in ('ADMIN', 'TEACHER') and active and deleted_at is null)
$$;


--
-- Name: new_link_token(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.new_link_token() RETURNS text
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;


--
-- Name: next_edit(timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.next_edit(p_prev timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select greatest(now(), p_prev + interval '1 millisecond');
$$;


--
-- Name: normalize_phone(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.normalize_phone(p text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare
  d text := regexp_replace(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g');
begin
  if d like '00%' then
    d := substr(d, 3);
  elsif d like '0%' and length(d) = 10 then
    d := '963' || substr(d, 2);
  end if;
  return case when d ~ '^[0-9]{7,15}$' then d end;
end $_$;


--
-- Name: ranking_settings_touch(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.ranking_settings_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;


--
-- Name: record_student_transfer(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.record_student_transfer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tz text := coalesce((select timezone from public.centers where id = new.center_id), 'Asia/Damascus');
begin
  if new.circle_id is distinct from old.circle_id then
    insert into public.student_transfers (student_id, from_circle_id, to_circle_id, transfer_date, created_by, center_id)
    values (new.id, old.circle_id, new.circle_id, (coalesce(new.edited_at, now()) at time zone v_tz)::date, auth.uid(), new.center_id);
  end if;
  return null;
end $$;


--
-- Name: set_creator(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_creator() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := coalesce(auth.uid(), new.teacher_id);
  elsif new.teacher_id is null and old.teacher_id is not null
        and not exists (select 1 from public.app_users where id = old.teacher_id) then
    null;
  else
    new.teacher_id := old.teacher_id;
  end if;
  return new;
end $$;


--
-- Name: stamp_deleted_by(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.stamp_deleted_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.deleted_at is null then new.deleted_by := null;
  elsif tg_op = 'INSERT' or old.deleted_at is null then new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  else new.deleted_by := old.deleted_by; end if;
  return new;
end $$;


--
-- Name: sync_touch(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and new.edited_at < old.edited_at then return null; end if;
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end $$;


--
-- Name: touch_center(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.touch_center() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin new.updated_at := now(); return new; end $$;


--
-- Name: accept_invite(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invite(p_token text, p_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_inv public.center_invites;
  v_email text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولًا';
  end if;
  select * into v_inv from public.center_invites where token = p_token for update;
  if v_inv.id is null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'رابط الدعوة غير صالح أو انتهت صلاحيته';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'استُخدم رابط الدعوة من قبل';
  end if;
  select email into v_email from auth.users where id = v_uid;
  if lower(v_email) is distinct from lower(v_inv.email) then
    raise exception 'هذه الدعوة لبريد آخر. ادخل بالبريد الذي وصلته الدعوة';
  end if;
  v_name := coalesce(nullif(btrim(p_name), ''), nullif(btrim(v_inv.name), ''), split_part(v_email, '@', 1));

  insert into public.app_users (id, name) values (v_uid, v_name) on conflict (id) do nothing;
  insert into public.memberships (user_id, center_id, name, role)
  values (v_uid, v_inv.center_id, v_name, v_inv.role)
  on conflict (user_id, center_id) do update set active = true, deleted_at = null, role = excluded.role;
  update public.center_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  update public.app_users set current_center_id = v_inv.center_id where id = v_uid;
  return jsonb_build_object('center_id', v_inv.center_id);
end $$;


--
-- Name: admin_accept_registration(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_accept_registration(p_id uuid, p_circle_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
  v_req public.registration_requests;
  v_circle public.circles;
  v_student uuid;
begin
  if not private.is_admin() then
    raise exception 'قبول طلبات التسجيل متاح للمدير فقط';
  end if;
  select * into v_req from public.registration_requests where id = p_id and center_id = v_center for update;
  if v_req.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_req.status <> 'PENDING' then
    raise exception 'تمّ البتّ في هذا الطلب من قبل';
  end if;
  select * into v_circle from public.circles where id = p_circle_id and center_id = v_center and active and deleted_at is null;
  if v_circle.id is null then
    raise exception 'اختر حلقة';
  end if;
  if v_circle.section is not null and v_circle.section <> v_req.section then
    raise exception 'الحلقة «%» ليست من قسم الطلب', v_circle.name;
  end if;
  insert into public.students (name, circle_id, guardian_name, guardian_phone, center_id)
  values (v_req.student_name, p_circle_id, v_req.guardian_name, v_req.guardian_phone, v_center)
  returning id into v_student;
  update public.registration_requests
  set status = 'ACCEPTED', decided_at = now(), decided_by = auth.uid(), student_id = v_student
  where id = p_id;
  return v_student;
end $$;


--
-- Name: admin_create_circle(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_circle(p_name text, p_section text DEFAULT NULL::text, p_students jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
  v_name text := private.clean_text(p_name);
  v_circle uuid;
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'إنشاء الحلقات متاح للمدير فقط';
  end if;
  if v_name is null or char_length(v_name) > 100 then
    raise exception 'اكتب اسم الحلقة';
  end if;
  if p_section is not null and p_section not in ('MALE', 'FEMALE') then
    raise exception 'القسم غير صحيح';
  end if;
  if p_students is not null and jsonb_typeof(p_students) <> 'array' then
    raise exception 'قائمة الطلاب غير صحيحة';
  end if;
  if jsonb_array_length(coalesce(p_students, '[]')) > 300 then
    raise exception 'الحد 300 اسم في المرة الواحدة';
  end if;
  if exists (select 1 from public.circles where center_id = v_center and lower(btrim(name)) = lower(v_name)) then
    raise exception 'يوجد حلقة بهذا الاسم (ربما في سجل المحذوفات — استرجعها من هناك)';
  end if;

  insert into public.circles (name, section, center_id) values (v_name, p_section, v_center) returning id into v_circle;

  insert into public.students (name, circle_id, center_id)
  select n, v_circle, v_center
  from (select distinct on (lower(n)) n, o
        from (select private.clean_text(x) n, o from jsonb_array_elements_text(coalesce(p_students, '[]')) with ordinality as t(x, o)) a
        where n is not null and char_length(n) between 2 and 100
        order by lower(n), o) b
  order by o;
  get diagnostics v_count = row_count;
  return jsonb_build_object('id', v_circle, 'students', v_count);
end $$;


--
-- Name: admin_purge(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_purge(p_kind text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;
  if p_kind = 'profile' then
    if p_id = auth.uid() then
      raise exception 'لا يمكنك حذف حسابك أنت';
    end if;
    if not exists (select 1 from public.memberships where user_id = p_id and center_id = v_center and deleted_at is not null) then
      raise exception 'العنصر ليس في سجل المحذوفات';
    end if;
    delete from public.memberships where user_id = p_id and center_id = v_center;
    -- The login goes only when it belongs to no other centre and isn't one of us.
    if not exists (select 1 from public.memberships where user_id = p_id)
       and not exists (select 1 from public.platform_admins where user_id = p_id) then
      delete from auth.users where id = p_id;
    end if;
  elsif p_kind = 'student' then
    delete from public.students where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'circle' then
    if exists (select 1 from public.students where circle_id = p_id) then
      raise exception 'لهذه الحلقة طلاب (ولو في سجل المحذوفات). امسحهم نهائيًا أو انقلهم أولًا';
    end if;
    delete from public.circles where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'arabic_book' then
    if exists (select 1 from public.arabic_entries where book_id = p_id)
       or exists (select 1 from public.student_arabic_enrollments where book_id = p_id) then
      raise exception 'لهذا الكتاب سجلات دروس عند الطلاب، فلا يمكن مسحه نهائيًا';
    end if;
    delete from public.arabic_books where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'quran_entry' then
    delete from public.quran_entries where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'arabic_entry' then
    delete from public.arabic_entries where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'edu_note' then
    delete from public.edu_notes where id = p_id and center_id = v_center and deleted_at is not null;
  elsif p_kind = 'talqeen_session' then
    delete from public.talqeen_sessions where id = p_id and center_id = v_center and deleted_at is not null;
  else
    raise exception 'نوع غير معروف';
  end if;
end $$;


--
-- Name: admin_reject_registration(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_registration(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.is_admin() then
    raise exception 'رفض طلبات التسجيل متاح للمدير فقط';
  end if;
  update public.registration_requests
  set status = 'REJECTED', decided_at = now(), decided_by = auth.uid()
  where id = p_id and status = 'PENDING' and center_id = private.current_center_id();
  if not found then
    raise exception 'تمّ البتّ في هذا الطلب من قبل';
  end if;
end $$;


--
-- Name: admin_restore(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restore(p_kind text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
  v_edited timestamptz;
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;
  if p_kind = 'profile' then
    update public.memberships set deleted_at = null where user_id = p_id and center_id = v_center;
    if found then
      update auth.users set banned_until = null where id = p_id;
    end if;
  elsif p_kind = 'student' then
    if exists (select 1 from public.students s join public.circles c on c.id = s.circle_id
               where s.id = p_id and c.deleted_at is not null) then
      raise exception 'حلقة هذا الطالب محذوفة. استرجع الحلقة أولًا';
    end if;
    update public.students set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'circle' then
    update public.circles set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'arabic_book' then
    update public.arabic_books set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'quran_entry' then
    update public.quran_entries set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'arabic_entry' then
    update public.arabic_entries set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'edu_note' then
    update public.edu_notes set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
  elsif p_kind = 'talqeen_session' then
    select edited_at into v_edited from public.talqeen_sessions where id = p_id and center_id = v_center;
    update public.talqeen_sessions set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id and center_id = v_center;
    update public.quran_entries set deleted_at = null, edited_at = private.next_edit(edited_at)
    where talqeen_session_id = p_id and center_id = v_center and deleted_at is not null and edited_at = v_edited;
  else
    raise exception 'نوع غير معروف';
  end if;
end $$;


--
-- Name: admin_soft_delete(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_soft_delete(p_kind text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;
  if p_kind = 'profile' then
    if p_id = auth.uid() then
      raise exception 'لا يمكنك حذف حسابك أنت';
    end if;
    if exists (select 1 from public.memberships where user_id = p_id and center_id = v_center and is_owner) then
      raise exception 'لا يمكن حذف صاحب المركز';
    end if;
    update public.memberships set deleted_at = now() where user_id = p_id and center_id = v_center and deleted_at is null;
    if not exists (select 1 from public.memberships where user_id = p_id and deleted_at is null) then
      update auth.users set banned_until = 'infinity' where id = p_id;
      delete from auth.sessions where user_id = p_id;
    end if;
  elsif p_kind = 'student' then
    update public.students set deleted_at = now(), edited_at = private.next_edit(edited_at)
    where id = p_id and center_id = v_center and deleted_at is null;
  elsif p_kind = 'circle' then
    if exists (select 1 from public.students where circle_id = p_id and deleted_at is null) then
      raise exception 'في هذه الحلقة طلاب. انقلهم إلى حلقة أخرى أو احذفهم أولًا';
    end if;
    update public.circles set deleted_at = now(), edited_at = private.next_edit(edited_at)
    where id = p_id and center_id = v_center and deleted_at is null;
  elsif p_kind = 'arabic_book' then
    if exists (select 1 from public.student_arabic_enrollments
               where book_id = p_id and deleted_at is null and finished_on is null) then
      raise exception 'هذا الكتاب يدرسه طلاب حاليًا. أنهِ تسجيلهم فيه أولًا';
    end if;
    update public.arabic_books set deleted_at = now(), edited_at = private.next_edit(edited_at)
    where id = p_id and center_id = v_center and deleted_at is null;
  else
    raise exception 'نوع غير معروف';
  end if;
end $$;


--
-- Name: admin_trash(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_trash() RETURNS TABLE(kind text, id text, label text, detail text, deleted_at timestamp with time zone, deleted_by_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;
  return query
    select 'profile', p.user_id::text, p.name, case p.role when 'ADMIN' then 'مدير' else 'محفّظ' end, p.deleted_at, d.name
    from public.memberships p left join public.memberships d on d.user_id = p.deleted_by and d.center_id = v_center
    where p.deleted_at is not null and p.center_id = v_center
  union all
    select 'student', s.id::text, s.name, coalesce('حلقة ' || c.name, ''), s.deleted_at, d.name
    from public.students s left join public.circles c on c.id = s.circle_id
    left join public.memberships d on d.user_id = s.deleted_by and d.center_id = v_center
    where s.deleted_at is not null and s.center_id = v_center
  union all
    select 'circle', c.id::text, c.name, '', c.deleted_at, d.name
    from public.circles c left join public.memberships d on d.user_id = c.deleted_by and d.center_id = v_center
    where c.deleted_at is not null and c.center_id = v_center
  union all
    select 'arabic_book', b.id::text, b.title, b.total_pages || ' صفحة', b.deleted_at, d.name
    from public.arabic_books b left join public.memberships d on d.user_id = b.deleted_by and d.center_id = v_center
    where b.deleted_at is not null and b.center_id = v_center
  union all
    select 'quran_entry', q.id::text,
           (case q.track when 'HIFZ' then 'حفظ' when 'TILAWA' then 'تلاوة' when 'MURAJAA' then 'مراجعة' else 'تلقين' end) || ' — ' || s.name,
           q.entry_date::text || coalesce(' · ' || fs.name || ' ' || q.from_ayah || ' ← ' || ts.name || ' ' || q.to_ayah, ''),
           q.deleted_at, d.name
    from public.quran_entries q
    join public.students s on s.id = q.student_id
    left join public.quran_surahs fs on fs.surah_no = q.from_surah_no
    left join public.quran_surahs ts on ts.surah_no = q.to_surah_no
    left join public.memberships d on d.user_id = q.deleted_by and d.center_id = v_center
    where q.deleted_at is not null and q.talqeen_session_id is null and q.center_id = v_center
  union all
    select 'arabic_entry', a.id::text, 'عربية — ' || s.name,
           a.entry_date::text || ' · ' || b.title || ' ص' || a.from_page || '-' || a.to_page, a.deleted_at, d.name
    from public.arabic_entries a
    join public.students s on s.id = a.student_id
    join public.arabic_books b on b.id = a.book_id
    left join public.memberships d on d.user_id = a.deleted_by and d.center_id = v_center
    where a.deleted_at is not null and a.center_id = v_center
  union all
    select 'edu_note', n.id::text, 'ملاحظة تربوية — ' || s.name, n.record_date::text || ' · ' || n.area, n.deleted_at, d.name
    from public.edu_notes n
    join public.students s on s.id = n.student_id
    left join public.memberships d on d.user_id = n.deleted_by and d.center_id = v_center
    where n.deleted_at is not null and n.center_id = v_center
  union all
    select 'talqeen_session', t.id::text, 'جلسة تلقين — ' || c.name,
           t.session_date::text || ' · ' || fs.name || ' ' || t.from_ayah || ' ← ' || ts.name || ' ' || t.to_ayah,
           t.deleted_at, d.name
    from public.talqeen_sessions t
    join public.circles c on c.id = t.circle_id
    left join public.quran_surahs fs on fs.surah_no = t.from_surah_no
    left join public.quran_surahs ts on ts.surah_no = t.to_surah_no
    left join public.memberships d on d.user_id = t.deleted_by and d.center_id = v_center
    where t.deleted_at is not null and t.center_id = v_center
  order by 5 desc;
end $$;


--
-- Name: ayahs_before(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ayahs_before(p_surah_no integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(ayah_count),0)::int from quran_surahs where surah_no < p_surah_no;
$$;


--
-- Name: create_center(text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_center(p_name text, p_slug text, p_country text, p_city text, p_owner_name text, p_about text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_palette text DEFAULT 'navy'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'سجّل الدخول أولًا';
  end if;
  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'أكّد بريدك الإلكتروني أولًا';
  end if;
  if char_length(btrim(coalesce(p_owner_name, ''))) not between 2 and 100 then
    raise exception 'اكتب اسمك (من حرفين إلى 100 حرف)';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or private.is_reserved_slug(v_slug) then
    raise exception 'رابط المركز: أحرف إنجليزية صغيرة وأرقام وشرطات، من 3 إلى 40 حرفًا';
  end if;
  if exists (select 1 from public.centers where slug = v_slug) then
    raise exception 'هذا الرابط مستخدم، اختر غيره';
  end if;
  -- Floods: a few centres per person, and a cap on new centres per hour for the whole platform.
  if (select count(*) from public.centers where owner_id = v_uid) >= 3 then
    raise exception 'وصلت للحد الأقصى من المراكز لحساب واحد. تواصل معنا';
  end if;
  if (select count(*) from public.centers where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'الخدمة مشغولة الآن، حاول بعد قليل';
  end if;

  insert into public.centers (slug, name, country, city, about, contact_phone, palette, owner_id, status, plan, trial_ends_at)
  values (v_slug, btrim(p_name), nullif(btrim(p_country), ''), nullif(btrim(p_city), ''), nullif(btrim(p_about), ''),
          nullif(btrim(p_phone), ''), coalesce(nullif(p_palette, ''), 'navy'), v_uid, 'ACTIVE', 'FREE', null)
  returning id into v_id;

  insert into public.app_users (id, name) values (v_uid, btrim(p_owner_name))
  on conflict (id) do nothing;
  insert into public.memberships (user_id, center_id, name, role, is_owner) values (v_uid, v_id, btrim(p_owner_name), 'ADMIN', true);
  insert into public.ranking_settings (center_id) values (v_id);
  update public.app_users set current_center_id = v_id where id = v_uid;
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $_$;


--
-- Name: guardian_view(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardian_view(p_token text) RETURNS jsonb
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
                                 'palette', v_center.palette, 'primary_color', v_center.primary_color),
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
      where q.student_id = v_student.id and q.deleted_at is null and q.entry_date >= v_since), '[]'::jsonb),
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
            order by exam_date desc, created_at desc limit 10) x), '[]'::jsonb)
  );
end $$;


--
-- Name: invite_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_info(p_token text) RETURNS jsonb
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


--
-- Name: my_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_context() RETURNS jsonb
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
                 'timezone', c.timezone, 'locale', c.locale, 'trial_ends_at', c.trial_ends_at)
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

CREATE FUNCTION public.public_center(p_slug text DEFAULT NULL::text, p_domain text DEFAULT NULL::text) RETURNS jsonb
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


--
-- Name: report_data(date, date, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_data(p_from date, p_to date, p_circle_id uuid DEFAULT NULL::uuid, p_student_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with st as (select id, circle_id from students where (p_student_id is null or id = p_student_id) and (p_circle_id is null or circle_id = p_circle_id))
  select jsonb_build_object(
    'quran', coalesce((select jsonb_agg(to_jsonb(q) order by q.entry_date, q.created_at) from quran_entries q
                       where q.student_id in (select id from st) and q.deleted_at is null and q.entry_date between p_from and p_to), '[]'::jsonb),
    'arabic', coalesce((select jsonb_agg(to_jsonb(a) order by a.entry_date, a.created_at) from arabic_entries a
                        where a.student_id in (select id from st) and a.deleted_at is null and a.entry_date between p_from and p_to), '[]'::jsonb),
    'tarbiya', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'student_id', n.student_id, 'record_date', n.record_date, 'area', n.area,
                          'note', n.note, 'quality', n.quality, 'teacher_id', n.teacher_id) order by n.record_date, n.created_at)
                         from edu_notes n where n.student_id in (select id from st) and n.deleted_at is null and n.record_date between p_from and p_to), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(t) order by t.att_date) from attendance t
                            where t.student_id in (select id from st) and t.deleted_at is null and t.att_date between p_from and p_to), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by l.lesson_date) from circle_lessons l
                         where l.circle_id in (select circle_id from st) and l.deleted_at is null and l.lesson_date between p_from and p_to), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(to_jsonb(v) order by v.activity_date) from activities v
                            where (v.circle_id is null or v.circle_id in (select circle_id from st)) and v.deleted_at is null
                              and v.activity_date between p_from and p_to), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(to_jsonb(x) order by x.exam_date) from exams x
                       where x.student_id in (select id from st) and x.deleted_at is null and x.exam_date between p_from and p_to), '[]'::jsonb));
$$;


--
-- Name: rotate_guardian_link(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_guardian_link(p_student_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_center uuid := private.current_center_id();
  v_token text;
begin
  if not private.is_admin() then
    raise exception 'تغيير رابط ولي الأمر متاح للمدير فقط';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and center_id = v_center) then
    raise exception 'الطالب غير موجود';
  end if;
  insert into public.guardian_links (student_id, center_id) values (p_student_id, v_center)
  on conflict (student_id) do update
    set token = private.new_link_token(), created_at = now(), updated_at = now(), last_opened_at = null, open_count = 0
  returning token into v_token;
  return v_token;
end $$;


--
-- Name: save_talqeen_session(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_talqeen_session(p_session jsonb, p_entries jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'private'
    AS $$
declare
  v_id uuid := (p_session ->> 'id')::uuid;
  v_date date := coalesce((p_session ->> 'session_date')::date, current_date);
  v_edited timestamptz := coalesce((p_session ->> 'edited_at')::timestamptz, now());
  v_deleted timestamptz := (p_session ->> 'deleted_at')::timestamptz;
begin
  if not private.is_staff() then raise exception 'غير مصرّح'; end if;
  insert into talqeen_sessions as t (id, circle_id, session_date, from_surah_no, from_ayah, to_surah_no, to_ayah, notes, edited_at, deleted_at)
  values (v_id, (p_session ->> 'circle_id')::uuid, v_date, (p_session ->> 'from_surah_no')::int, (p_session ->> 'from_ayah')::int,
          (p_session ->> 'to_surah_no')::int, (p_session ->> 'to_ayah')::int, nullif(p_session ->> 'notes', ''), v_edited, v_deleted)
  on conflict (id) do update set circle_id = excluded.circle_id, session_date = excluded.session_date, from_surah_no = excluded.from_surah_no,
    from_ayah = excluded.from_ayah, to_surah_no = excluded.to_surah_no, to_ayah = excluded.to_ayah, notes = excluded.notes,
    edited_at = excluded.edited_at, deleted_at = excluded.deleted_at;
  if not exists (select 1 from talqeen_sessions where id = v_id and edited_at = v_edited) then return; end if;
  if v_deleted is not null then p_entries := '[]'::jsonb; end if;
  insert into quran_entries as q (id, student_id, entry_date, track, from_surah_no, from_ayah, to_surah_no, to_ayah, quality, notes, talqeen_session_id, edited_at, deleted_at)
  select (e ->> 'id')::uuid, (e ->> 'student_id')::uuid, v_date, 'TALQEEN', t.from_surah_no, t.from_ayah, t.to_surah_no, t.to_ayah,
         nullif(e ->> 'quality', ''), nullif(e ->> 'notes', ''), v_id, v_edited, null
  from jsonb_array_elements(p_entries) e cross join talqeen_sessions t where t.id = v_id
  on conflict (id) do update set student_id = excluded.student_id, entry_date = excluded.entry_date, from_surah_no = excluded.from_surah_no,
    from_ayah = excluded.from_ayah, to_surah_no = excluded.to_surah_no, to_ayah = excluded.to_ayah, quality = excluded.quality,
    notes = excluded.notes, edited_at = excluded.edited_at, deleted_at = null;
  update quran_entries set deleted_at = now(), edited_at = v_edited
  where talqeen_session_id = v_id and deleted_at is null and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(p_entries) e);
  insert into attendance as a (student_id, att_date, status, edited_at)
  select (e ->> 'student_id')::uuid, v_date, 'PRESENT', v_edited from jsonb_array_elements(p_entries) e
  on conflict (student_id, att_date) do update set status = 'PRESENT', deleted_at = null, edited_at = greatest(a.edited_at, excluded.edited_at)
  where a.status = 'ABSENT' or a.deleted_at is not null;
end $$;


--
-- Name: service_user_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.service_user_id(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;


--
-- Name: submit_registration(text, integer, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_registration(p_student_name text, p_age integer, p_section text, p_guardian_name text, p_guardian_phone text, p_memorized text, p_trap text DEFAULT NULL::text, p_center text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_name text := private.clean_text(p_student_name);
  v_guardian text := private.clean_text(p_guardian_name);
  v_memorized text := private.clean_text(p_memorized);
  v_phone text := private.normalize_phone(p_guardian_phone);
  v_center public.centers;
begin
  -- A program that filled the hidden field: say "received" so it learns nothing.
  if coalesce(p_trap, '') <> '' then
    return true;
  end if;
  select * into v_center from public.centers
  where slug = lower(btrim(coalesce(p_center, ''))) and status <> 'SUSPENDED';
  if v_center.id is null then
    raise exception 'المركز غير موجود';
  end if;
  if not v_center.registrations_open then
    raise exception 'التسجيل مغلق حاليًا في هذا المركز. تواصلوا مع الإدارة';
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'اكتبوا اسم الطالب (من حرفين إلى 100 حرف)';
  end if;
  if v_name ~ '[0-9٠-٩@/\\{}\[\]|$%^*=]' or v_name ~* '(https?|www\.)' then
    raise exception 'اسم الطالب: حروف فقط';
  end if;
  if p_age is not null and (p_age < 3 or p_age > 80) then
    raise exception 'العمر غير صحيح';
  end if;
  if p_section is null or p_section not in ('MALE', 'FEMALE') then
    raise exception 'اختاروا القسم';
  end if;
  if v_phone is null then
    raise exception 'رقم ولي الأمر غير صحيح';
  end if;
  if char_length(coalesce(v_guardian, '')) > 100 or char_length(coalesce(v_memorized, '')) > 300 then
    raise exception 'النص طويل جدًا';
  end if;
  if v_memorized ~* '(https?://|www\.)' or v_guardian ~* '(https?://|www\.)' then
    raise exception 'لا تضعوا روابط في الطلب';
  end if;

  -- The same child sent twice (a double tap, or sent again later): keep the first, say "received".
  if exists (select 1 from public.registration_requests
             where center_id = v_center.id and status = 'PENDING' and guardian_phone = v_phone
               and lower(student_name) = lower(v_name)) then
    return true;
  end if;
  -- Floods: a few requests per number a day, a cap per centre per hour and on the whole platform.
  if (select count(*) from public.registration_requests
      where guardian_phone = v_phone and created_at > now() - interval '1 day') >= 5 then
    raise exception 'وصلتنا طلبات كثيرة من هذا الرقم اليوم. سنتواصل معكم قريبًا إن شاء الله';
  end if;
  if (select count(*) from public.registration_requests where center_id = v_center.id and created_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.registration_requests where created_at > now() - interval '1 hour') >= 600 then
    raise exception 'الخدمة مشغولة الآن، حاولوا بعد قليل';
  end if;

  insert into public.registration_requests (student_name, age, section, guardian_name, guardian_phone, memorized, center_id)
  values (v_name, p_age, p_section, v_guardian, v_phone, v_memorized, v_center.id);
  return true;
end $_$;


--
-- Name: super_centers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_centers() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.is_platform_admin() then
    raise exception 'هذه الصفحة لإدارة المنصة فقط';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name', c.name, 'country', c.country, 'city', c.city, 'status', c.status, 'plan', c.plan,
      'domain', c.domain, 'created_at', c.created_at, 'trial_ends_at', c.trial_ends_at,
      'owner_email', (select u.email from auth.users u where u.id = c.owner_id),
      'staff', (select count(*) from public.memberships m where m.center_id = c.id and m.deleted_at is null and m.active),
      'students', (select count(*) from public.students s where s.center_id = c.id and s.deleted_at is null and s.active),
      'circles', (select count(*) from public.circles x where x.center_id = c.id and x.deleted_at is null),
      'last_activity', (select max(q.created_at) from public.quran_entries q where q.center_id = c.id)
    ) order by c.created_at)
    from public.centers c), '[]'::jsonb);
end $$;


--
-- Name: super_set_center(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_set_center(p_id uuid, p_status text DEFAULT NULL::text, p_plan text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.is_platform_admin() then
    raise exception 'هذه الصفحة لإدارة المنصة فقط';
  end if;
  update public.centers set status = coalesce(p_status, status), plan = coalesce(p_plan, plan) where id = p_id;
  if not found then
    raise exception 'المركز غير موجود';
  end if;
end $$;


--
-- Name: switch_center(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.switch_center(p_center_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.memberships m join public.centers c on c.id = m.center_id
                 where m.user_id = auth.uid() and m.center_id = p_center_id and m.active and m.deleted_at is null
                   and c.status <> 'SUSPENDED') then
    raise exception 'لست عضوًا فعّالًا في هذا المركز';
  end if;
  update public.app_users set current_center_id = p_center_id where id = auth.uid();
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arabic_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arabic_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    book_id uuid NOT NULL,
    from_page integer NOT NULL,
    to_page integer NOT NULL,
    quality text,
    notes text,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT arabic_entries_check CHECK ((to_page >= from_page)),
    CONSTRAINT arabic_entries_from_page_check CHECK ((from_page >= 1))
);


--
-- Name: sync_latest_arabic_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_latest_arabic_entries() RETURNS SETOF public.arabic_entries
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct on (student_id, book_id) * from arabic_entries where deleted_at is null
  order by student_id, book_id, to_page desc, entry_date desc;
$$;


--
-- Name: quran_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quran_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    track text NOT NULL,
    from_surah_no integer,
    from_ayah integer,
    to_surah_no integer,
    to_ayah integer,
    quality text,
    notes text,
    talqeen_session_id uuid,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT quran_entries_check CHECK (((track = 'TALQEEN'::text) OR (talqeen_session_id IS NULL))),
    CONSTRAINT quran_entries_track_check CHECK ((track = ANY (ARRAY['HIFZ'::text, 'TILAWA'::text, 'MURAJAA'::text, 'TALQEEN'::text])))
);


--
-- Name: sync_latest_quran_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_latest_quran_entries() RETURNS SETOF public.quran_entries
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct on (student_id, track) * from quran_entries where deleted_at is null
  order by student_id, track, entry_date desc, created_at desc;
$$;


--
-- Name: tilawah_percent(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tilawah_percent(p_surah_no integer, p_ayah integer) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select round((public.ayahs_before(p_surah_no) + coalesce(p_ayah,0))::numeric / (select sum(ayah_count) from quran_surahs) * 100)::int;
$$;


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    activity_date date NOT NULL,
    circle_id uuid,
    student_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT activities_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    current_center_id uuid
);


--
-- Name: arabic_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arabic_books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    total_pages integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT arabic_books_title_check CHECK ((btrim(title) <> ''::text)),
    CONSTRAINT arabic_books_total_pages_check CHECK ((total_pages > 0))
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    student_id uuid NOT NULL,
    att_date date NOT NULL,
    status text NOT NULL,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['PRESENT'::text, 'LATE'::text, 'EXCUSED'::text, 'ABSENT'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor uuid,
    table_name text NOT NULL,
    row_key text NOT NULL,
    student_id uuid,
    action text NOT NULL,
    changes jsonb NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text, 'RESTORE'::text])))
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: center_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.center_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    email text NOT NULL,
    name text,
    role text DEFAULT 'TEACHER'::text NOT NULL,
    token text DEFAULT private.new_link_token() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT center_invites_email_check CHECK (((email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text) AND (char_length(email) <= 200))),
    CONSTRAINT center_invites_name_check CHECK ((char_length(name) <= 100)),
    CONSTRAINT center_invites_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'TEACHER'::text])))
);


--
-- Name: centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    country text,
    city text,
    logo_url text,
    palette text DEFAULT 'navy'::text NOT NULL,
    primary_color text,
    about text,
    extra_notes text,
    contact_phone text,
    contact_email text,
    whatsapp text,
    instagram text,
    facebook text,
    address text,
    timezone text DEFAULT 'Asia/Damascus'::text NOT NULL,
    locale text DEFAULT 'ar'::text NOT NULL,
    domain text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    plan text DEFAULT 'FREE'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    onboarded boolean DEFAULT false NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    registrations_open boolean DEFAULT true NOT NULL,
    CONSTRAINT centers_about_check CHECK ((char_length(about) <= 2000)),
    CONSTRAINT centers_address_check CHECK ((char_length(address) <= 200)),
    CONSTRAINT centers_city_check CHECK ((char_length(city) <= 60)),
    CONSTRAINT centers_contact_email_check CHECK ((char_length(contact_email) <= 120)),
    CONSTRAINT centers_contact_phone_check CHECK ((char_length(contact_phone) <= 30)),
    CONSTRAINT centers_country_check CHECK ((char_length(country) <= 60)),
    CONSTRAINT centers_domain_check CHECK ((domain ~ '^[a-z0-9.-]{3,253}$'::text)),
    CONSTRAINT centers_extra_notes_check CHECK ((char_length(extra_notes) <= 4000)),
    CONSTRAINT centers_facebook_check CHECK ((char_length(facebook) <= 200)),
    CONSTRAINT centers_instagram_check CHECK ((char_length(instagram) <= 200)),
    CONSTRAINT centers_locale_check CHECK ((locale = ANY (ARRAY['ar'::text, 'en'::text]))),
    CONSTRAINT centers_logo_url_check CHECK (((logo_url IS NULL) OR ((char_length(logo_url) <= 350000) AND (logo_url ~ '^(https://[^\s"''<>]+|/images/[a-z0-9._-]+|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$'::text)))),
    CONSTRAINT centers_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT centers_palette_check CHECK ((palette = ANY (ARRAY['indigo'::text, 'navy'::text, 'plum'::text, 'slate'::text]))),
    CONSTRAINT centers_plan_check CHECK ((plan = ANY (ARRAY['FREE'::text, 'BASIC'::text, 'PRO'::text]))),
    CONSTRAINT centers_primary_color_check CHECK ((primary_color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT centers_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text)),
    CONSTRAINT centers_slug_not_reserved CHECK ((NOT private.is_reserved_slug(slug))),
    CONSTRAINT centers_status_check CHECK ((status = ANY (ARRAY['TRIAL'::text, 'ACTIVE'::text, 'SUSPENDED'::text]))),
    CONSTRAINT centers_timezone_check CHECK ((char_length(timezone) <= 64)),
    CONSTRAINT centers_whatsapp_check CHECK ((char_length(whatsapp) <= 30))
);


--
-- Name: circle_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circle_lessons (
    circle_id uuid NOT NULL,
    lesson_date date NOT NULL,
    title text NOT NULL,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT circle_lessons_title_check CHECK ((btrim(title) <> ''::text))
);


--
-- Name: circles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    section text,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT circles_section_check CHECK ((section = ANY (ARRAY['MALE'::text, 'FEMALE'::text])))
);


--
-- Name: edu_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.edu_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    record_date date DEFAULT CURRENT_DATE NOT NULL,
    student_id uuid NOT NULL,
    teacher_id uuid,
    area text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    quality text,
    center_id uuid DEFAULT private.current_center_id() NOT NULL
);


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    exam_date date NOT NULL,
    kind text NOT NULL,
    juz_no smallint,
    surah_no integer,
    examiner text,
    score numeric(5,2) NOT NULL,
    passed boolean NOT NULL,
    notes text,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT exams_juz_no_check CHECK (((juz_no >= 1) AND (juz_no <= 30))),
    CONSTRAINT exams_kind_check CHECK ((kind = ANY (ARRAY['JUZ'::text, 'SURAH'::text, 'MONTHLY'::text]))),
    CONSTRAINT exams_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
);


--
-- Name: guardian_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardian_links (
    student_id uuid NOT NULL,
    token text DEFAULT private.new_link_token() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_opened_at timestamp with time zone,
    open_count integer DEFAULT 0 NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT guardian_links_token_check CHECK ((char_length(token) >= 32))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    user_id uuid NOT NULL,
    center_id uuid NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    is_owner boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    default_filter text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT memberships_default_filter_check CHECK ((default_filter ~ '^(all|s:(MALE|FEMALE)|c:[0-9a-f-]{36})$'::text)),
    CONSTRAINT memberships_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100))),
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'TEACHER'::text])))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles WITH (security_invoker='true') AS
 SELECT user_id AS id,
    name,
    role,
    active,
    created_at,
    deleted_at,
    deleted_by,
    default_filter,
    is_owner,
    center_id,
    updated_at
   FROM public.memberships m
  WHERE (center_id = private.current_center_id());


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_auth_check CHECK ((char_length(auth) <= 100)),
    CONSTRAINT push_subscriptions_endpoint_check CHECK (((endpoint ~ '^https://'::text) AND (char_length(endpoint) <= 1000))),
    CONSTRAINT push_subscriptions_p256dh_check CHECK ((char_length(p256dh) <= 200)),
    CONSTRAINT push_subscriptions_user_agent_check CHECK ((char_length(user_agent) <= 300))
);


--
-- Name: quran_surahs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quran_surahs (
    surah_no integer NOT NULL,
    name text NOT NULL,
    ayah_count integer NOT NULL
);


--
-- Name: ranking_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ranking_settings (
    id smallint DEFAULT 1 NOT NULL,
    weights jsonb DEFAULT '{"hifz": 40, "tilawa": 20, "tarbiya": 10, "activities": 10, "attendance": 20}'::jsonb NOT NULL,
    grades jsonb DEFAULT '{"جيد": 70, "إعادة": 40, "تمكين": 60, "ممتاز": 100, "جيد جدًا": 85}'::jsonb NOT NULL,
    week_start smallint DEFAULT 6 NOT NULL,
    course_start date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    absence_threshold smallint DEFAULT 3 NOT NULL,
    absence_message text,
    pass_mark smallint DEFAULT 70 NOT NULL,
    honor_enabled boolean DEFAULT false NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT ranking_settings_absence_message_check CHECK ((char_length(absence_message) <= 1000)),
    CONSTRAINT ranking_settings_absence_threshold_check CHECK (((absence_threshold >= 1) AND (absence_threshold <= 30))),
    CONSTRAINT ranking_settings_pass_mark_check CHECK (((pass_mark >= 1) AND (pass_mark <= 100))),
    CONSTRAINT ranking_settings_week_start_check CHECK (((week_start >= 0) AND (week_start <= 6)))
);


--
-- Name: registration_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_name text NOT NULL,
    age smallint,
    section text NOT NULL,
    guardian_name text,
    guardian_phone text NOT NULL,
    memorized text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    student_id uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT registration_requests_section_check CHECK ((section = ANY (ARRAY['MALE'::text, 'FEMALE'::text]))),
    CONSTRAINT registration_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text])))
);


--
-- Name: report_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_sends (
    student_id uuid NOT NULL,
    send_date date NOT NULL,
    kind text NOT NULL,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT report_sends_kind_check CHECK ((kind = ANY (ARRAY['DAILY'::text, 'MONTHLY'::text, 'ABSENCE'::text])))
);


--
-- Name: student_arabic_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_arabic_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    book_id uuid NOT NULL,
    started_on date DEFAULT CURRENT_DATE NOT NULL,
    finished_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    center_id uuid DEFAULT private.current_center_id() NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    circle_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    guardian_name text,
    guardian_phone text,
    weekly_goal_ayahs smallint,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT students_guardian_name_check CHECK ((char_length(guardian_name) <= 100)),
    CONSTRAINT students_guardian_phone_check CHECK ((guardian_phone ~ '^[0-9]{7,15}$'::text)),
    CONSTRAINT students_weekly_goal_ayahs_check CHECK (((weekly_goal_ayahs >= 1) AND (weekly_goal_ayahs <= 1000)))
);


--
-- Name: student_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_progress WITH (security_invoker='true') AS
 SELECT id AS student_id,
    name,
    circle_id
   FROM public.students s;


--
-- Name: student_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    from_circle_id uuid,
    to_circle_id uuid,
    transfer_date date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    center_id uuid DEFAULT private.current_center_id() NOT NULL
);


--
-- Name: talqeen_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.talqeen_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    circle_id uuid NOT NULL,
    session_date date DEFAULT CURRENT_DATE NOT NULL,
    from_surah_no integer NOT NULL,
    from_ayah integer NOT NULL,
    to_surah_no integer NOT NULL,
    to_ayah integer NOT NULL,
    notes text,
    teacher_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    center_id uuid DEFAULT private.current_center_id() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    filter text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    center_id uuid DEFAULT private.current_center_id() NOT NULL,
    CONSTRAINT user_settings_filter_check CHECK ((filter ~ '^(all|s:(MALE|FEMALE)|c:[0-9a-f-]{36})$'::text))
);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: arabic_books arabic_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_books
    ADD CONSTRAINT arabic_books_pkey PRIMARY KEY (id);


--
-- Name: arabic_entries arabic_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_entries
    ADD CONSTRAINT arabic_entries_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (student_id, att_date);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: center_invites center_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_invites
    ADD CONSTRAINT center_invites_pkey PRIMARY KEY (id);


--
-- Name: center_invites center_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_invites
    ADD CONSTRAINT center_invites_token_key UNIQUE (token);


--
-- Name: centers centers_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centers
    ADD CONSTRAINT centers_domain_key UNIQUE (domain);


--
-- Name: centers centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centers
    ADD CONSTRAINT centers_pkey PRIMARY KEY (id);


--
-- Name: centers centers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centers
    ADD CONSTRAINT centers_slug_key UNIQUE (slug);


--
-- Name: circle_lessons circle_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_lessons
    ADD CONSTRAINT circle_lessons_pkey PRIMARY KEY (circle_id, lesson_date);


--
-- Name: circles circles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circles
    ADD CONSTRAINT circles_pkey PRIMARY KEY (id);


--
-- Name: edu_notes edu_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edu_notes
    ADD CONSTRAINT edu_notes_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: guardian_links guardian_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_links
    ADD CONSTRAINT guardian_links_pkey PRIMARY KEY (student_id);


--
-- Name: guardian_links guardian_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_links
    ADD CONSTRAINT guardian_links_token_key UNIQUE (token);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (user_id, center_id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: app_users profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: quran_entries quran_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_pkey PRIMARY KEY (id);


--
-- Name: quran_surahs quran_surahs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_surahs
    ADD CONSTRAINT quran_surahs_name_key UNIQUE (name);


--
-- Name: quran_surahs quran_surahs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_surahs
    ADD CONSTRAINT quran_surahs_pkey PRIMARY KEY (surah_no);


--
-- Name: ranking_settings ranking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ranking_settings
    ADD CONSTRAINT ranking_settings_pkey PRIMARY KEY (center_id);


--
-- Name: registration_requests registration_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_requests
    ADD CONSTRAINT registration_requests_pkey PRIMARY KEY (id);


--
-- Name: report_sends report_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_pkey PRIMARY KEY (student_id, send_date, kind);


--
-- Name: student_arabic_enrollments student_arabic_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_arabic_enrollments
    ADD CONSTRAINT student_arabic_enrollments_pkey PRIMARY KEY (id);


--
-- Name: student_arabic_enrollments student_arabic_enrollments_student_id_book_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_arabic_enrollments
    ADD CONSTRAINT student_arabic_enrollments_student_id_book_id_key UNIQUE (student_id, book_id);


--
-- Name: student_transfers student_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: talqeen_sessions talqeen_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id, center_id);


--
-- Name: arabic_books_title_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX arabic_books_title_unique ON public.arabic_books USING btree (center_id, lower(btrim(title)));


--
-- Name: circles_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX circles_name_unique ON public.circles USING btree (center_id, lower(btrim(name)));


--
-- Name: idx_activities_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_center ON public.activities USING btree (center_id);


--
-- Name: idx_arabic_books_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arabic_books_center ON public.arabic_books USING btree (center_id);


--
-- Name: idx_arabic_entries_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arabic_entries_center ON public.arabic_entries USING btree (center_id);


--
-- Name: idx_attendance_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_center ON public.attendance USING btree (center_id);


--
-- Name: idx_audit_log_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_center ON public.audit_log USING btree (center_id);


--
-- Name: idx_center_invites_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_center_invites_center ON public.center_invites USING btree (center_id, created_at DESC);


--
-- Name: idx_circle_lessons_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circle_lessons_center ON public.circle_lessons USING btree (center_id);


--
-- Name: idx_circles_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circles_center ON public.circles USING btree (center_id);


--
-- Name: idx_edu_notes_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_edu_notes_center ON public.edu_notes USING btree (center_id);


--
-- Name: idx_exams_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_center ON public.exams USING btree (center_id);


--
-- Name: idx_guardian_links_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardian_links_center ON public.guardian_links USING btree (center_id);


--
-- Name: idx_memberships_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_center ON public.memberships USING btree (center_id);


--
-- Name: idx_push_subscriptions_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_center ON public.push_subscriptions USING btree (center_id);


--
-- Name: idx_quran_entries_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quran_entries_center ON public.quran_entries USING btree (center_id);


--
-- Name: idx_ranking_settings_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ranking_settings_center ON public.ranking_settings USING btree (center_id);


--
-- Name: idx_registration_requests_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_requests_center ON public.registration_requests USING btree (center_id);


--
-- Name: idx_report_sends_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_sends_center ON public.report_sends USING btree (center_id);


--
-- Name: idx_student_arabic_enrollments_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_arabic_enrollments_center ON public.student_arabic_enrollments USING btree (center_id);


--
-- Name: idx_student_transfers_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_transfers_center ON public.student_transfers USING btree (center_id);


--
-- Name: idx_students_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_center ON public.students USING btree (center_id);


--
-- Name: idx_talqeen_sessions_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_talqeen_sessions_center ON public.talqeen_sessions USING btree (center_id);


--
-- Name: idx_user_settings_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_settings_center ON public.user_settings USING btree (center_id);


--
-- Name: activities trg_activity_students; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_students BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION private.check_activity_students();


--
-- Name: arabic_books trg_arabic_books_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_arabic_books_sync BEFORE INSERT OR UPDATE ON public.arabic_books FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: attendance trg_attendance_creator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_creator BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.set_creator();


--
-- Name: attendance trg_attendance_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_sync BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: attendance trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.audit_row('student_id', 'att_date');


--
-- Name: circles trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.circles FOR EACH ROW EXECUTE FUNCTION private.audit_row('id');


--
-- Name: memberships trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.audit_row('user_id');


--
-- Name: quran_entries trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.quran_entries FOR EACH ROW EXECUTE FUNCTION private.audit_row('id');


--
-- Name: students trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.audit_row('id');


--
-- Name: centers trg_centers_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_centers_touch BEFORE UPDATE ON public.centers FOR EACH ROW EXECUTE FUNCTION private.touch_center();


--
-- Name: circles trg_circles_deleted_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_circles_deleted_by BEFORE INSERT OR UPDATE ON public.circles FOR EACH ROW EXECUTE FUNCTION private.stamp_deleted_by();


--
-- Name: circles trg_circles_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_circles_sync BEFORE INSERT OR UPDATE ON public.circles FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: edu_notes trg_edu_notes_creator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_edu_notes_creator BEFORE INSERT OR UPDATE ON public.edu_notes FOR EACH ROW EXECUTE FUNCTION private.set_creator();


--
-- Name: edu_notes trg_edu_notes_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_edu_notes_sync BEFORE INSERT OR UPDATE ON public.edu_notes FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: memberships trg_memberships_deleted_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memberships_deleted_by BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.stamp_deleted_by();


--
-- Name: memberships trg_memberships_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memberships_guard BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.guard_membership();


--
-- Name: quran_entries trg_quran_entries_creator; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_quran_entries_creator BEFORE INSERT OR UPDATE ON public.quran_entries FOR EACH ROW EXECUTE FUNCTION private.set_creator();


--
-- Name: quran_entries trg_quran_entries_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_quran_entries_sync BEFORE INSERT OR UPDATE ON public.quran_entries FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: ranking_settings trg_ranking_settings_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ranking_settings_touch BEFORE UPDATE ON public.ranking_settings FOR EACH ROW EXECUTE FUNCTION private.ranking_settings_touch();


--
-- Name: activities trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION private.check_same_center('circle_id', 'circles');


--
-- Name: arabic_entries trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.arabic_entries FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students', 'book_id', 'arabic_books');


--
-- Name: attendance trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students');


--
-- Name: circle_lessons trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.circle_lessons FOR EACH ROW EXECUTE FUNCTION private.check_same_center('circle_id', 'circles');


--
-- Name: edu_notes trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.edu_notes FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students');


--
-- Name: exams trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students');


--
-- Name: guardian_links trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.guardian_links FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students');


--
-- Name: quran_entries trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.quran_entries FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students', 'talqeen_session_id', 'talqeen_sessions');


--
-- Name: report_sends trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.report_sends FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students');


--
-- Name: student_arabic_enrollments trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.student_arabic_enrollments FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students', 'book_id', 'arabic_books');


--
-- Name: student_transfers trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.student_transfers FOR EACH ROW EXECUTE FUNCTION private.check_same_center('student_id', 'students', 'from_circle_id', 'circles', 'to_circle_id', 'circles');


--
-- Name: students trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.check_same_center('circle_id', 'circles');


--
-- Name: talqeen_sessions trg_same_center; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_center BEFORE INSERT OR UPDATE ON public.talqeen_sessions FOR EACH ROW EXECUTE FUNCTION private.check_same_center('circle_id', 'circles');


--
-- Name: students trg_students_deleted_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_deleted_by BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.stamp_deleted_by();


--
-- Name: students trg_students_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_guard BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.guard_student_archive();


--
-- Name: students trg_students_guardian_link; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_guardian_link AFTER INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION private.create_guardian_link();


--
-- Name: students trg_students_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_sync BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.sync_touch();


--
-- Name: students trg_students_transfer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_transfer AFTER UPDATE OF circle_id ON public.students FOR EACH ROW EXECUTE FUNCTION private.record_student_transfer();


--
-- Name: activities activities_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: activities activities_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;


--
-- Name: activities activities_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id);


--
-- Name: app_users app_users_current_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_current_center_id_fkey FOREIGN KEY (current_center_id) REFERENCES public.centers(id) ON DELETE SET NULL;


--
-- Name: arabic_books arabic_books_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_books
    ADD CONSTRAINT arabic_books_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: arabic_entries arabic_entries_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_entries
    ADD CONSTRAINT arabic_entries_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.arabic_books(id) ON DELETE CASCADE;


--
-- Name: arabic_entries arabic_entries_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_entries
    ADD CONSTRAINT arabic_entries_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: arabic_entries arabic_entries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_entries
    ADD CONSTRAINT arabic_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: arabic_entries arabic_entries_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arabic_entries
    ADD CONSTRAINT arabic_entries_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: center_invites center_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_invites
    ADD CONSTRAINT center_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: center_invites center_invites_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_invites
    ADD CONSTRAINT center_invites_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: center_invites center_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_invites
    ADD CONSTRAINT center_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: centers centers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centers
    ADD CONSTRAINT centers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: circle_lessons circle_lessons_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_lessons
    ADD CONSTRAINT circle_lessons_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: circle_lessons circle_lessons_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_lessons
    ADD CONSTRAINT circle_lessons_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;


--
-- Name: circle_lessons circle_lessons_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circle_lessons
    ADD CONSTRAINT circle_lessons_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id);


--
-- Name: circles circles_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circles
    ADD CONSTRAINT circles_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: edu_notes edu_notes_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edu_notes
    ADD CONSTRAINT edu_notes_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: edu_notes edu_notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edu_notes
    ADD CONSTRAINT edu_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: edu_notes edu_notes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edu_notes
    ADD CONSTRAINT edu_notes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: exams exams_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: exams exams_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: exams exams_surah_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_surah_no_fkey FOREIGN KEY (surah_no) REFERENCES public.quran_surahs(surah_no);


--
-- Name: exams exams_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id);


--
-- Name: guardian_links guardian_links_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_links
    ADD CONSTRAINT guardian_links_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: guardian_links guardian_links_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_links
    ADD CONSTRAINT guardian_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: app_users profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: quran_entries quran_entries_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: quran_entries quran_entries_from_surah_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_from_surah_no_fkey FOREIGN KEY (from_surah_no) REFERENCES public.quran_surahs(surah_no);


--
-- Name: quran_entries quran_entries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: quran_entries quran_entries_talqeen_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_talqeen_session_id_fkey FOREIGN KEY (talqeen_session_id) REFERENCES public.talqeen_sessions(id) ON DELETE CASCADE;


--
-- Name: quran_entries quran_entries_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: quran_entries quran_entries_to_surah_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quran_entries
    ADD CONSTRAINT quran_entries_to_surah_no_fkey FOREIGN KEY (to_surah_no) REFERENCES public.quran_surahs(surah_no);


--
-- Name: ranking_settings ranking_settings_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ranking_settings
    ADD CONSTRAINT ranking_settings_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: registration_requests registration_requests_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_requests
    ADD CONSTRAINT registration_requests_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: registration_requests registration_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_requests
    ADD CONSTRAINT registration_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: registration_requests registration_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_requests
    ADD CONSTRAINT registration_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: report_sends report_sends_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: report_sends report_sends_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: report_sends report_sends_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_sends
    ADD CONSTRAINT report_sends_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id);


--
-- Name: student_arabic_enrollments student_arabic_enrollments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_arabic_enrollments
    ADD CONSTRAINT student_arabic_enrollments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.arabic_books(id) ON DELETE CASCADE;


--
-- Name: student_arabic_enrollments student_arabic_enrollments_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_arabic_enrollments
    ADD CONSTRAINT student_arabic_enrollments_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: student_arabic_enrollments student_arabic_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_arabic_enrollments
    ADD CONSTRAINT student_arabic_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_transfers student_transfers_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: student_transfers student_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: student_transfers student_transfers_from_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_from_circle_id_fkey FOREIGN KEY (from_circle_id) REFERENCES public.circles(id) ON DELETE SET NULL;


--
-- Name: student_transfers student_transfers_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_transfers student_transfers_to_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_transfers
    ADD CONSTRAINT student_transfers_to_circle_id_fkey FOREIGN KEY (to_circle_id) REFERENCES public.circles(id) ON DELETE SET NULL;


--
-- Name: students students_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: students students_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;


--
-- Name: talqeen_sessions talqeen_sessions_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: talqeen_sessions talqeen_sessions_circle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles(id) ON DELETE CASCADE;


--
-- Name: talqeen_sessions talqeen_sessions_from_surah_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_from_surah_no_fkey FOREIGN KEY (from_surah_no) REFERENCES public.quran_surahs(surah_no);


--
-- Name: talqeen_sessions talqeen_sessions_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: talqeen_sessions talqeen_sessions_to_surah_no_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.talqeen_sessions
    ADD CONSTRAINT talqeen_sessions_to_surah_no_fkey FOREIGN KEY (to_surah_no) REFERENCES public.quran_surahs(surah_no);


--
-- Name: user_settings user_settings_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_insert ON public.activities FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: activities activities_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_same_center ON public.activities AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: activities activities_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: activities activities_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_update ON public.activities FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_select ON public.app_users FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.user_id = app_users.id) AND (m.center_id = ( SELECT private.current_center_id() AS current_center_id)))))));


--
-- Name: app_users app_users_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_users_update ON public.app_users FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: arabic_books; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arabic_books ENABLE ROW LEVEL SECURITY;

--
-- Name: arabic_books arabic_books_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_books_insert ON public.arabic_books FOR INSERT TO authenticated WITH CHECK (private.is_admin());


--
-- Name: arabic_books arabic_books_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_books_same_center ON public.arabic_books AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: arabic_books arabic_books_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_books_select ON public.arabic_books FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: arabic_books arabic_books_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_books_update ON public.arabic_books FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: arabic_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arabic_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: arabic_entries arabic_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_entries_insert ON public.arabic_entries FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: arabic_entries arabic_entries_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_entries_same_center ON public.arabic_entries AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: arabic_entries arabic_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_entries_select ON public.arabic_entries FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: arabic_entries arabic_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arabic_entries_update ON public.arabic_entries FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_insert ON public.attendance FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: attendance attendance_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_same_center ON public.attendance AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: attendance attendance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select ON public.attendance FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: attendance attendance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_update ON public.attendance FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_same_center ON public.audit_log AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: audit_log audit_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: center_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.center_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: center_invites center_invites_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY center_invites_admin ON public.center_invites TO authenticated USING (((center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin)));


--
-- Name: centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;

--
-- Name: centers centers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_select ON public.centers FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.center_id = centers.id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL)))) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: centers centers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_update ON public.centers FOR UPDATE TO authenticated USING (((id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin)));


--
-- Name: circle_lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.circle_lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: circle_lessons circle_lessons_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circle_lessons_insert ON public.circle_lessons FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: circle_lessons circle_lessons_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circle_lessons_same_center ON public.circle_lessons AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: circle_lessons circle_lessons_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circle_lessons_select ON public.circle_lessons FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: circle_lessons circle_lessons_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circle_lessons_update ON public.circle_lessons FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: circles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

--
-- Name: circles circles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circles_insert ON public.circles FOR INSERT TO authenticated WITH CHECK (private.is_admin());


--
-- Name: circles circles_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circles_same_center ON public.circles AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: circles circles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circles_select ON public.circles FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: circles circles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY circles_update ON public.circles FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: edu_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.edu_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: edu_notes edu_notes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY edu_notes_insert ON public.edu_notes FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: edu_notes edu_notes_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY edu_notes_same_center ON public.edu_notes AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: edu_notes edu_notes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY edu_notes_select ON public.edu_notes FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: edu_notes edu_notes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY edu_notes_update ON public.edu_notes FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--
-- Name: exams exams_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_insert ON public.exams FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: exams exams_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_same_center ON public.exams AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: exams exams_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_select ON public.exams FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: exams exams_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_update ON public.exams FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: guardian_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;

--
-- Name: guardian_links guardian_links_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_links_same_center ON public.guardian_links AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: guardian_links guardian_links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_links_select ON public.guardian_links FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships memberships_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_select ON public.memberships FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_staff() AS is_staff))));


--
-- Name: memberships memberships_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_update ON public.memberships FOR UPDATE TO authenticated USING (((center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin))) WITH CHECK (((center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_admin() AS is_admin)));


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_own ON public.push_subscriptions TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (center_id = ( SELECT private.current_center_id() AS current_center_id)))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (center_id = ( SELECT private.current_center_id() AS current_center_id)) AND ( SELECT private.is_staff() AS is_staff)));


--
-- Name: quran_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quran_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: quran_entries quran_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quran_entries_insert ON public.quran_entries FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: quran_entries quran_entries_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quran_entries_same_center ON public.quran_entries AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: quran_entries quran_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quran_entries_select ON public.quran_entries FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: quran_entries quran_entries_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quran_entries_update ON public.quran_entries FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: quran_surahs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quran_surahs ENABLE ROW LEVEL SECURITY;

--
-- Name: quran_surahs quran_surahs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quran_surahs_select ON public.quran_surahs FOR SELECT TO authenticated USING (true);


--
-- Name: ranking_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ranking_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ranking_settings ranking_settings_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ranking_settings_same_center ON public.ranking_settings AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: ranking_settings ranking_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ranking_settings_select ON public.ranking_settings FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: ranking_settings ranking_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ranking_settings_update ON public.ranking_settings FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: registration_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_requests registration_requests_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_requests_same_center ON public.registration_requests AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: registration_requests registration_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registration_requests_select ON public.registration_requests FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: report_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: report_sends report_sends_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_sends_insert ON public.report_sends FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: report_sends report_sends_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_sends_same_center ON public.report_sends AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: report_sends report_sends_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_sends_select ON public.report_sends FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: report_sends report_sends_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_sends_update ON public.report_sends FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: student_arabic_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_arabic_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: student_arabic_enrollments student_arabic_enrollments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_arabic_enrollments_insert ON public.student_arabic_enrollments FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: student_arabic_enrollments student_arabic_enrollments_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_arabic_enrollments_same_center ON public.student_arabic_enrollments AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: student_arabic_enrollments student_arabic_enrollments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_arabic_enrollments_select ON public.student_arabic_enrollments FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: student_arabic_enrollments student_arabic_enrollments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_arabic_enrollments_update ON public.student_arabic_enrollments FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: student_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: student_transfers student_transfers_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_transfers_same_center ON public.student_transfers AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: student_transfers student_transfers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_transfers_select ON public.student_transfers FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_insert ON public.students FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: students students_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_same_center ON public.students AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: students students_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select ON public.students FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: students students_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_update ON public.students FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: talqeen_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.talqeen_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: talqeen_sessions talqeen_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY talqeen_sessions_insert ON public.talqeen_sessions FOR INSERT TO authenticated WITH CHECK (private.is_staff());


--
-- Name: talqeen_sessions talqeen_sessions_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY talqeen_sessions_same_center ON public.talqeen_sessions AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: talqeen_sessions talqeen_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY talqeen_sessions_select ON public.talqeen_sessions FOR SELECT TO authenticated USING (private.is_staff());


--
-- Name: talqeen_sessions talqeen_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY talqeen_sessions_update ON public.talqeen_sessions FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());


--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings user_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_staff()));


--
-- Name: user_settings user_settings_same_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_same_center ON public.user_settings AS RESTRICTIVE TO authenticated USING ((center_id = ( SELECT private.current_center_id() AS current_center_id))) WITH CHECK ((center_id = ( SELECT private.current_center_id() AS current_center_id)));


--
-- Name: user_settings user_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_select ON public.user_settings FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_settings user_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.is_staff()));


--
-- Supabase gives anon and authenticated every privilege on new tables, sequences and functions by
-- default. Take those back here, so that only the explicit grants below apply (exactly what the
-- tests in supabase/tests run against).
--

REVOKE ALL ON ALL TABLES IN SCHEMA public, private FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, private FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, private FROM anon, authenticated;

--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO anon;
GRANT USAGE ON SCHEMA private TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION audit_row(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.audit_row() TO authenticated;
GRANT ALL ON FUNCTION private.audit_row() TO anon;
GRANT ALL ON FUNCTION private.audit_row() TO service_role;


--
-- Name: FUNCTION check_activity_students(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.check_activity_students() FROM PUBLIC;


--
-- Name: FUNCTION check_same_center(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.check_same_center() FROM PUBLIC;


--
-- Name: FUNCTION clean_text(p text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.clean_text(p text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.clean_text(p text) TO authenticated;
GRANT ALL ON FUNCTION private.clean_text(p text) TO anon;
GRANT ALL ON FUNCTION private.clean_text(p text) TO service_role;


--
-- Name: FUNCTION create_guardian_link(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.create_guardian_link() TO authenticated;
GRANT ALL ON FUNCTION private.create_guardian_link() TO anon;
GRANT ALL ON FUNCTION private.create_guardian_link() TO service_role;


--
-- Name: FUNCTION current_center_id(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.current_center_id() FROM PUBLIC;
GRANT ALL ON FUNCTION private.current_center_id() TO authenticated;
GRANT ALL ON FUNCTION private.current_center_id() TO anon;
GRANT ALL ON FUNCTION private.current_center_id() TO service_role;


--
-- Name: FUNCTION guard_membership(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.guard_membership() FROM PUBLIC;


--
-- Name: FUNCTION guard_student_archive(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.guard_student_archive() TO authenticated;
GRANT ALL ON FUNCTION private.guard_student_archive() TO anon;
GRANT ALL ON FUNCTION private.guard_student_archive() TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_admin() TO authenticated;
GRANT ALL ON FUNCTION private.is_admin() TO anon;
GRANT ALL ON FUNCTION private.is_admin() TO service_role;


--
-- Name: FUNCTION is_platform_admin(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_platform_admin() TO authenticated;
GRANT ALL ON FUNCTION private.is_platform_admin() TO anon;
GRANT ALL ON FUNCTION private.is_platform_admin() TO service_role;


--
-- Name: FUNCTION is_reserved_slug(p_slug text); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_reserved_slug(p_slug text) TO authenticated;
GRANT ALL ON FUNCTION private.is_reserved_slug(p_slug text) TO anon;
GRANT ALL ON FUNCTION private.is_reserved_slug(p_slug text) TO service_role;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.is_staff() TO authenticated;
GRANT ALL ON FUNCTION private.is_staff() TO anon;
GRANT ALL ON FUNCTION private.is_staff() TO service_role;


--
-- Name: FUNCTION new_link_token(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.new_link_token() TO authenticated;
GRANT ALL ON FUNCTION private.new_link_token() TO anon;
GRANT ALL ON FUNCTION private.new_link_token() TO service_role;


--
-- Name: FUNCTION next_edit(p_prev timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.next_edit(p_prev timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION private.next_edit(p_prev timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION private.next_edit(p_prev timestamp with time zone) TO service_role;


--
-- Name: FUNCTION normalize_phone(p text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.normalize_phone(p text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.normalize_phone(p text) TO authenticated;
GRANT ALL ON FUNCTION private.normalize_phone(p text) TO anon;
GRANT ALL ON FUNCTION private.normalize_phone(p text) TO service_role;


--
-- Name: FUNCTION ranking_settings_touch(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.ranking_settings_touch() TO authenticated;
GRANT ALL ON FUNCTION private.ranking_settings_touch() TO anon;
GRANT ALL ON FUNCTION private.ranking_settings_touch() TO service_role;


--
-- Name: FUNCTION record_student_transfer(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.record_student_transfer() TO authenticated;
GRANT ALL ON FUNCTION private.record_student_transfer() TO anon;
GRANT ALL ON FUNCTION private.record_student_transfer() TO service_role;


--
-- Name: FUNCTION set_creator(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.set_creator() TO authenticated;
GRANT ALL ON FUNCTION private.set_creator() TO anon;
GRANT ALL ON FUNCTION private.set_creator() TO service_role;


--
-- Name: FUNCTION stamp_deleted_by(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.stamp_deleted_by() TO authenticated;
GRANT ALL ON FUNCTION private.stamp_deleted_by() TO anon;
GRANT ALL ON FUNCTION private.stamp_deleted_by() TO service_role;


--
-- Name: FUNCTION sync_touch(); Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON FUNCTION private.sync_touch() TO authenticated;
GRANT ALL ON FUNCTION private.sync_touch() TO anon;
GRANT ALL ON FUNCTION private.sync_touch() TO service_role;


--
-- Name: FUNCTION accept_invite(p_token text, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_invite(p_token text, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_invite(p_token text, p_name text) TO authenticated;


--
-- Name: FUNCTION admin_accept_registration(p_id uuid, p_circle_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_accept_registration(p_id uuid, p_circle_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_accept_registration(p_id uuid, p_circle_id uuid) TO authenticated;


--
-- Name: FUNCTION admin_create_circle(p_name text, p_section text, p_students jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_create_circle(p_name text, p_section text, p_students jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_circle(p_name text, p_section text, p_students jsonb) TO authenticated;


--
-- Name: FUNCTION create_center(p_name text, p_slug text, p_country text, p_city text, p_owner_name text, p_about text, p_phone text, p_palette text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_center(p_name text, p_slug text, p_country text, p_city text, p_owner_name text, p_about text, p_phone text, p_palette text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_center(p_name text, p_slug text, p_country text, p_city text, p_owner_name text, p_about text, p_phone text, p_palette text) TO authenticated;


--
-- Name: FUNCTION invite_info(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invite_info(p_token text) TO anon;
GRANT ALL ON FUNCTION public.invite_info(p_token text) TO authenticated;


--
-- Name: FUNCTION my_context(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_context() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_context() TO authenticated;


--
-- Name: FUNCTION public_center(p_slug text, p_domain text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.public_center(p_slug text, p_domain text) TO anon;
GRANT ALL ON FUNCTION public.public_center(p_slug text, p_domain text) TO authenticated;


--
-- Name: FUNCTION service_user_id(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.service_user_id(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.service_user_id(p_email text) TO service_role;


--
-- Name: FUNCTION submit_registration(p_student_name text, p_age integer, p_section text, p_guardian_name text, p_guardian_phone text, p_memorized text, p_trap text, p_center text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_registration(p_student_name text, p_age integer, p_section text, p_guardian_name text, p_guardian_phone text, p_memorized text, p_trap text, p_center text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_registration(p_student_name text, p_age integer, p_section text, p_guardian_name text, p_guardian_phone text, p_memorized text, p_trap text, p_center text) TO anon;
GRANT ALL ON FUNCTION public.submit_registration(p_student_name text, p_age integer, p_section text, p_guardian_name text, p_guardian_phone text, p_memorized text, p_trap text, p_center text) TO authenticated;


--
-- Name: FUNCTION super_centers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.super_centers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.super_centers() TO authenticated;


--
-- Name: FUNCTION super_set_center(p_id uuid, p_status text, p_plan text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.super_set_center(p_id uuid, p_status text, p_plan text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.super_set_center(p_id uuid, p_status text, p_plan text) TO authenticated;


--
-- Name: FUNCTION switch_center(p_center_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.switch_center(p_center_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.switch_center(p_center_id uuid) TO authenticated;


--
-- Name: TABLE arabic_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.arabic_entries TO authenticated;
GRANT ALL ON TABLE public.arabic_entries TO service_role;


--
-- Name: TABLE quran_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.quran_entries TO authenticated;
GRANT ALL ON TABLE public.quran_entries TO service_role;


--
-- Name: TABLE activities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;


--
-- Name: TABLE app_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_users TO authenticated;
GRANT ALL ON TABLE public.app_users TO service_role;


--
-- Name: COLUMN app_users.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.app_users TO authenticated;


--
-- Name: TABLE arabic_books; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.arabic_books TO authenticated;
GRANT ALL ON TABLE public.arabic_books TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: TABLE center_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.center_invites TO authenticated;
GRANT ALL ON TABLE public.center_invites TO service_role;


--
-- Name: COLUMN center_invites.revoked_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(revoked_at) ON TABLE public.center_invites TO authenticated;


--
-- Name: TABLE centers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.centers TO service_role;
GRANT SELECT ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.country; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(country) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.city; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(city) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.logo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(logo_url) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.palette; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(palette) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.primary_color; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(primary_color) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.about; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(about) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.extra_notes; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(extra_notes) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.contact_phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(contact_phone) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.contact_email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(contact_email) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.whatsapp; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(whatsapp) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.instagram; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(instagram) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.facebook; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(facebook) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.address; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(address) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.timezone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(timezone) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.locale; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(locale) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.onboarded; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(onboarded) ON TABLE public.centers TO authenticated;


--
-- Name: COLUMN centers.registrations_open; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(registrations_open) ON TABLE public.centers TO authenticated;


--
-- Name: TABLE circle_lessons; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.circle_lessons TO authenticated;
GRANT ALL ON TABLE public.circle_lessons TO service_role;


--
-- Name: TABLE circles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.circles TO authenticated;
GRANT ALL ON TABLE public.circles TO service_role;


--
-- Name: TABLE edu_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.edu_notes TO authenticated;
GRANT ALL ON TABLE public.edu_notes TO service_role;


--
-- Name: TABLE exams; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.exams TO authenticated;
GRANT ALL ON TABLE public.exams TO service_role;


--
-- Name: TABLE guardian_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.guardian_links TO authenticated;
GRANT ALL ON TABLE public.guardian_links TO service_role;


--
-- Name: TABLE memberships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.memberships TO authenticated;
GRANT ALL ON TABLE public.memberships TO service_role;


--
-- Name: COLUMN memberships.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.memberships TO authenticated;


--
-- Name: COLUMN memberships.role; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(role) ON TABLE public.memberships TO authenticated;


--
-- Name: COLUMN memberships.active; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(active) ON TABLE public.memberships TO authenticated;


--
-- Name: COLUMN memberships.default_filter; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(default_filter) ON TABLE public.memberships TO authenticated;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_admins TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.role; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(role) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.active; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(active) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.default_filter; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(default_filter) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE quran_surahs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.quran_surahs TO authenticated;
GRANT ALL ON TABLE public.quran_surahs TO service_role;


--
-- Name: TABLE ranking_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.ranking_settings TO authenticated;
GRANT ALL ON TABLE public.ranking_settings TO service_role;


--
-- Name: TABLE registration_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.registration_requests TO authenticated;
GRANT ALL ON TABLE public.registration_requests TO service_role;


--
-- Name: TABLE report_sends; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.report_sends TO authenticated;
GRANT ALL ON TABLE public.report_sends TO service_role;


--
-- Name: TABLE student_arabic_enrollments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.student_arabic_enrollments TO authenticated;
GRANT ALL ON TABLE public.student_arabic_enrollments TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE student_progress; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.student_progress TO authenticated;


--
-- Name: TABLE student_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.student_transfers TO authenticated;
GRANT ALL ON TABLE public.student_transfers TO service_role;


--
-- Name: TABLE talqeen_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.talqeen_sessions TO authenticated;
GRANT ALL ON TABLE public.talqeen_sessions TO service_role;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;

RESET ALL;  -- undo the SETs at the top (row_security, search_path …) for whatever runs next
