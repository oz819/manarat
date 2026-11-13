-- منارات: داخل التطبيق مثل مركز مضايا — كل المسارات ظاهرة لكل مركز (الحفظ، المراجعة، التلاوة،
-- التلقين، العربية، التربية، الاختبارات). لا يُحذف شيء: العمود يبقى، ويصير افتراضيه كل المسارات،
-- وتُفعَّل كل المسارات للمراكز الموجودة حتى يعرض رابط وليّ الأمر كل ما يسجّله المعلّم.
alter table public.centers
  alter column enabled_tracks set default array['HIFZ', 'MURAJAA', 'TILAWA', 'TALQEEN', 'ARABIC', 'TARBIYA', 'EXAMS']::text[];

update public.centers
   set enabled_tracks = array['HIFZ', 'MURAJAA', 'TILAWA', 'TALQEEN', 'ARABIC', 'TARBIYA', 'EXAMS']::text[]
 where enabled_tracks is distinct from array['HIFZ', 'MURAJAA', 'TILAWA', 'TALQEEN', 'ARABIC', 'TARBIYA', 'EXAMS']::text[];
