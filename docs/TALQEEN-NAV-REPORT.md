# التسليم: القائمة العلوية، ونقل جلسة التلقين إلى «الطلاب»، والتلقين اختياري

البرومبت: [TALQEEN-NAV-PROMPT.md](TALQEEN-NAV-PROMPT.md). اللقطات في [talqeen-nav/](talqeen-nav/) (من النسخة التجريبية محليًا، `NEXT_PUBLIC_DEMO=1`).

## التعديل 1: ترتيب القائمة

- قائمة المدير وصاحب المركز: الطلاب · التقارير · المتفوقون · الإدارة · سجل التعديلات · سجل المحذوفات · اللوحة.
- المعلّم يرى: الطلاب · التقارير · المتفوقون فقط (الأزرار الإدارية ما زالت مشروطة بـ `profile.role === "ADMIN"`).
- الملف: `components/AppShell.tsx`.

## التعديل 2: جلسة التلقين داخل «الطلاب»

- أُزيل زر «التلقين» من القائمة.
- بطاقة مطويّة بعد «درس اليوم» عنوانها «🎙️ جلسة {اسم التلقين في المركز}»، تُفتح بالضغط عليها، وفيها `components/sections/Talqeen.tsx` نفسه دون تغيير في منطق الحفظ (أُضيف له فقط `embedded` لإخفاء عنوانه المكرر).
- الصفحة `talqeen` باقية في `Page` و`PAGES`، وفتحها (رابط أو سجل قديم) يحوّل إلى «الطلاب».
- `FilterBar` يظهر مرة واحدة في صفحة الطلاب.
- نص «لا توجد جلسات» في بطاقة الطالب صار يشير إلى البطاقة الجديدة بدل شاشة «التلقين».
- الملفات: `components/AppShell.tsx`، `components/sections/Students.tsx`، `components/sections/Talqeen.tsx`، `components/StudentCard.tsx`، `app/globals.css`.

## التعديل 3: قسم التلقين اختياري

- في الإدارة بعد إعدادات المركز: بطاقة «🎙️ قسم التلقين» بمفتاح واحد، وحقل «اسم القسم في مركزك» عند التفعيل فقط، وسطر الشرح، وزر «حفظ».
- الحفظ يستعمل منطق `CenterTracks.tsx` نفسه (نُقل إلى دالة مشتركة `saveTracks`): يضيف أو يزيل `TALQEEN` وحده من `enabled_tracks`، ويحفظ `talqeen_label`، ثم `refreshCenter()`. عند الإيقاف يبقى الاسم محفوظًا.
- عند الإيقاف يختفي التلقين من: بطاقة الجلسة في الطلاب، وتبويب بطاقة الطالب وسطر موضعه، وخيار التقارير وقيمتها الابتدائية، وسطره في رسالة التقرير اليومي للأهل (`SendReports` ← `dayLines`). رابط وليّ الأمر كانت قاعدة البيانات تخفيه أصلًا.
- عند التفعيل يظهر باسم المركز (`tracks.label("TALQEEN")`) في كل هذه الأماكن، وفي رابط وليّ الأمر (`talqeen_label`).
- سجلّا المحذوفات والتعديلات وتصدير Excel لم تتغيّر.
- لا migration ولا تغيير في قاعدة البيانات.
- الملفات: `components/center/CenterTracks.tsx`، `components/sections/Manage.tsx`، `components/sections/Students.tsx`، `components/StudentCard.tsx`، `components/sections/Reports.tsx`، `components/SendReports.tsx`، `lib/familyMessages.ts`، `app/p/[token]/page.tsx`، `supabase/tests/isolation.test.mjs`.

## الاختبارات

| الأمر | النتيجة |
| --- | --- |
| `npm run test:db` | 140 ناجحًا، 0 فاشل (كان 139؛ أُضيف: صاحب المركز يزيل التلقين ثم يعيده، وتبقى باقي المسارات واسمه وما سُجّل فيه) |
| `npx tsc --noEmit` | بلا أخطاء |
| `npx eslint .` | 0 أخطاء (تحذير واحد قديم في `lib/quran.ts` لم يُلمس) |
| `npx next build` | ناجح (بمتغيرات النسخة التجريبية؛ بدون `NEXT_PUBLIC_SUPABASE_URL` يفشل البناء كما كان قبل التعديلات) |

## اللقطات

1. المدير: [القائمة](talqeen-nav/1-admin-nav.jpg)، [الإدارة](talqeen-nav/1-admin-manage.jpg)، [سجل التعديلات](talqeen-nav/1-admin-audit.jpg)، [سجل المحذوفات](talqeen-nav/1-admin-trash.jpg).
2. المعلّم: [القائمة بلا الأزرار الإدارية وبلا «التلقين»](talqeen-nav/2-teacher-nav.jpg).
3. الطلاب: [البطاقة مطويّة](talqeen-nav/3a-talqeen-folded.jpg)، [مفتوحة](talqeen-nav/3b-talqeen-open.jpg)، [بعد الحفظ في «جلسات هذا اليوم»](talqeen-nav/3c-talqeen-saved.jpg)، [في بطاقة الطالب](talqeen-nav/3d-student-card-talqeen.jpg).
4. الإدارة: [مفعّل](talqeen-nav/4a-setting-on.jpg) ← [موقوف](talqeen-nav/4b-setting-off.jpg) ← [بطاقة الطالب بلا تلقين](talqeen-nav/4-off-student-card.jpg) و[التقارير بلا تلقين](talqeen-nav/4-off-reports.jpg) ← [مفعّل باسم «التسميع»](talqeen-nav/4c-setting-tasmee.jpg) ← [الطلاب](talqeen-nav/4d-students-tasmee.jpg) و[بطاقة الطالب](talqeen-nav/4-tasmee-student-card.jpg) و[التقارير](talqeen-nav/4-tasmee-reports.jpg) بالاسم الجديد.
5. [الجوال 390px](talqeen-nav/5-mobile-390.jpg): كل الأزرار ظاهرة في سطرين، وعرض القائمة = عرض الشاشة (390) بلا تمرير جانبي.
