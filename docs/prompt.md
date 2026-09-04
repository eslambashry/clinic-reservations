ابدأ باستخدام Serena فورًا وبشكل إلزامي قبل أي تعديل:

1. فعّل المشروع الحالي في Serena.
2. اقرأ project memories وملفات MEMORY.md وCLAUDE.md وأي تعليمات محلية.
3. استخدم Serena لاستكشاف الرموز والعلاقات:
   - find_symbol
   - find_referencing_symbols
   - search_for_pattern
   - read_file
4. حدّد مستودع الفرونت ومجلد لوحة تحكم الطبيب، ولا تفترض أن الباكند وحده هو نطاق العمل.
5. أنشئ خريطة مختصرة لمسار البيانات بين الفرونت والباكند وقاعدة البيانات قبل التنفيذ.
6. استخدم Serena في قراءة وتعديل الملفات قدر الإمكان، واستخدم الطرفية فقط للتثبيت، migrations، الاختبارات، build، وlint.
7. لا تبدأ بكتابة كود عشوائي. افهم أولًا الـ domain model، الصلاحيات، الـ DTOs، الـ controllers، الـ use-cases، والـ repositories.

## الهدف

تنفيذ تكامل كامل وقوي بين لوحة تحكم الطبيب والباكند بحيث يستطيع الطبيب إدارة ملفه المهني، العيادات المرتبطة به، جدول مواعيده، ومواعيده الحالية بسهولة وأمان.

هذه فجوة قاتلة في المنتج. لا يكفي وجود endpoints للمريض أو Admin فقط. يجب أن تكون تجربة الطبيب كاملة من لوحة التحكم إلى قاعدة البيانات.

## نطاق التنفيذ الإلزامي

### 1. بروفايل الطبيب

يجب دعم:

- قراءة بروفايل الطبيب الحالي.
- تعديل البيانات المسموح للطبيب تعديلها.
- تعديل الاسم والبريد من خلال مسار الحساب الحالي.
- عدم السماح للطبيب بتعديل:
  - license number
  - specialty
  - verification status
  - أي حقل إداري أو حساس بدون صلاحية واضحة.
- إعادة البيانات المحدثة للفرونت مباشرة بعد الحفظ.
- إظهار أخطاء validation وauthorization بشكل مفهوم.

تحقق من وجود وتكامل:

- GET `/v1/doctors/me`
- PATCH `/v1/doctors/me`
- GET `/v1/auth/me`
- PATCH `/v1/auth/me`

إذا كان endpoint موجودًا لكنه لا يعيد البيانات المطلوبة أو لا يتوافق مع الفرونت، أصلح العقد بدل إضافة workaround في الواجهة.

### 2. معلومات العيادة والفروع

يجب أن يستطيع الطبيب، من خلال لوحة التحكم، رؤية العيادات والفروع المرتبطة به وتعديل البيانات التشغيلية المسموح بها.

المطلوب:

- إضافة endpoint موثوق لجلب عيادات وفروع الطبيب الحالي، مثل:
  - GET `/v1/doctors/me/clinics`
  أو تصميم أفضل يتوافق مع بنية المشروع.
- عدم قبول `doctorId` من الفرونت لتحديد نطاق البيانات.
- استخراج الطبيب من JWT.
- عرض:
  - clinic id
  - clinic name
  - branch id
  - phone
  - address
  - timezone
  - verification/status
  - affiliation status
- السماح للطبيب بتعديل الفروع المرتبطة به فقط.
- منع الطبيب من تعديل عيادة أو فرع غير مرتبط به.
- افصل بين:
  - البيانات القانونية الحساسة للعيادة
  - البيانات التشغيلية التي يستطيع الطبيب تعديلها.
- لا تنفذ hard delete.
- استخدم soft delete أو suspend عند الحاجة.
- لا تسمح بحذف عيادة أو فرع لديه مواعيد مستقبلية قبل تطبيق business rule واضح.
- أضف audit log لكل تعديل أو إيقاف.

يجب تطبيق authorization على مستوى الـ use-case والـ repository، وليس في controller فقط.

### 3. جدول الطبيب والمواعيد المتاحة

يجب أن يستطيع الطبيب إدارة schedule templates الخاصة به:

- إنشاء جدول جديد.
- قراءة جداول الطبيب.
- تعديل جدول موجود.
- حذف أو تعطيل جدول موجود.
- منع الطبيب من الوصول إلى schedule template خاص بطبيب آخر.
- دعم:
  - weekday
  - startTime
  - endTime
  - slotDurationMinutes
  - bufferMinutes
- احترام timezone الخاص بالفرع.
- عدم تعديل أو حذف appointment slots المحجوزة سابقًا بشكل صامت.
- أي تعديل يؤثر فقط على slot generation المستقبلية، حسب قواعد المشروع.
- تطبيق optimistic locking باستخدام `version`.
- تسجيل جميع العمليات في audit log.

يفضل استخدام مسارات واضحة خاصة بالطبيب، مثل:

- GET `/v1/doctors/me/schedule-templates`
- POST `/v1/doctors/me/schedule-templates`
- PATCH `/v1/doctors/me/schedule-templates/:id`
- DELETE `/v1/doctors/me/schedule-templates/:id`

لكن لا تضف هذه المسارات قبل فحص التصميم الحالي. حافظ على naming conventions الموجودة، ويمكنك تعديل المسارات الحالية إذا كان ذلك أنسب، مع توثيق سبب التغيير.

### 4. مواعيد الطبيب

يجب أن يستطيع الطبيب من لوحة التحكم:

- رؤية مواعيده القادمة.
- فلترة المواعيد حسب:
  - date
  - status
  - clinic branch
- فتح تفاصيل الموعد.
- إلغاء موعد من جهة الطبيب مع reason واضح.
- إعادة جدولة الموعد عند الحاجة.
- عدم تنفيذ hard delete للموعد.
- استخدم lifecycle واضح:
  - CONFIRMED
  - CANCELLED
  - RESCHEDULED
  - COMPLETED
- عند إلغاء الطبيب لموعد:
  - تحرير slot بشكل ذري.
  - تطبيق refund policy المناسبة.
  - استخدام سبب `PROVIDER_REQUEST`.
  - إرسال event عبر transactional outbox.
  - تسجيل العملية في audit log.
  - منع السباق بين طلبين متزامنين.
- عند إعادة الجدولة:
  - لا تنشئ مسارًا يتجاوز hold/confirm rules.
  - لا تسمح بتغيير الطبيب أو الفرع ضمن reschedule إذا كانت القاعدة تمنع ذلك.
  - حافظ على سلسلة reschedule history.
  - استخدم idempotency عند العمليات الحساسة.

المسارات المطلوبة يجب أن تكون doctor-scoped، مثل:

- GET `/v1/doctors/me/appointments`
- GET `/v1/doctors/me/appointments/:id`
- POST `/v1/appointments/:id/cancel`
- POST `/v1/appointments/:id/reschedule`

يمكن إعادة استخدام use-cases الحالية، لكن لا تكرر business logic ولا تنسخ الكود.

### 5. الصلاحيات والأمان

طبّق التالي بدقة:

- الطبيب يستطيع الوصول إلى بياناته فقط.
- الطبيب يستطيع الوصول فقط إلى clinic branches المرتبطة به.
- الطبيب يستطيع الوصول فقط إلى schedule templates التابعة لارتباطاته.
- الطبيب يستطيع قراءة وإدارة المواعيد المرتبطة به فقط.
- أي محاولة للوصول إلى مورد غير مملوك ترجع behavior موحدًا وآمنًا، ويفضل إخفاء وجود المورد عند الحاجة.
- لا تعتمد على ids القادمة من الفرونت لتحديد ownership.
- استخدم JWT context وrole membership.
- احترم global guards وRBAC الموجودين.
- لا تضع authorization logic في الفرونت فقط.
- لا تعرض stack traces أو raw database errors.
- لا تستخدم direct cross-module database access بطريقة تخالف قواعد المشروع.
- حافظ على optimistic locking وtransactional outbox وaudit trail.

### 6. تكامل الفرونت والباكند

افحص لوحة تحكم الطبيب بالكامل:

- API client methods.
- request/response models.
- authentication headers.
- token refresh.
- loading states.
- empty states.
- validation errors.
- 401/403/404/409/422.
- optimistic locking conflicts.
- save success behavior.
- delete/cancel confirmation.
- cache invalidation أو refresh بعد التعديل.
- pagination وfilters.
- منع double-submit أثناء العمليات الحساسة.

تأكد أن الفرونت لا يستدعي endpoints وهمية مثل:

- `/v1/provider/me`

واستخدم endpoints فعلية متوافقة مع الباكند.

لا تجعل الفرونت يعتمد على أسماء حقول مختلفة عن DTOs. وحّد naming strategy حسب convention المشروع، وأصلح كل mismatch في الطرفين.

### 7. الاختبارات المطلوبة

أضف اختبارات unit وintegration وE2E حسب البنية الموجودة، وتشمل:

- الطبيب يقرأ بروفايله.
- الطبيب يعدل بروفايله.
- الطبيب يقرأ عياداته وفروعه.
- الطبيب يعدل فرعًا تابعًا له.
- الطبيب يفشل في تعديل فرع غير تابع له.
- الطبيب ينشئ schedule template.
- الطبيب يعدل schedule template الخاص به.
- الطبيب يفشل في تعديل schedule template لطبيب آخر.
- الطبيب يرى مواعيده فقط.
- الطبيب يلغي موعدًا مؤكدًا.
- الطبيب يفشل في إلغاء موعد غير تابع له.
- إلغاء الموعد يحرر slot ويرسل outbox event ويسجل audit.
- reschedule يحافظ على transaction وownership.
- concurrent requests لا تؤدي إلى state corruption.
- patient وadmin behavior الحالي لا يتراجع.
- كل endpoint يرجع response envelope الصحيح.
- test للـ 401 و403 و404 و409 و422.

شغّل:

- `npm run build`
- `npm run lint`
- `npm test`
- `npm run test:e2e`

وشغّل اختبارات الفرونت المناسبة، مثل:

- typecheck
- lint
- unit tests
- widget/component tests
- integration tests

لا تعتبر المهمة مكتملة إذا نجح الباكند فقط بينما الفرونت يستدعي عقدًا مختلفًا.

### 8. التوثيق والـ diagram

بعد التنفيذ:

1. حدّث API documentation وREADME وملفات القرارات عند الحاجة.
2. وثّق الصلاحيات والـ ownership rules.
3. أضف diagram بصيغة Mermaid يوضح:
   - Doctor Dashboard
   - JWT/RBAC
   - Controllers
   - Use-cases
   - Repositories
   - PostgreSQL
   - Audit Log
   - Transactional Outbox
   - Slot Generation Job
4. أضف diagram منفصل لمسار:
   - تعديل بروفايل الطبيب
   - تعديل معلومات الفرع
   - تعديل schedule
   - إلغاء موعد الطبيب
   - إعادة جدولة الموعد

## قواعد التنفيذ

- لا تعمل refactor واسعًا غير مطلوب.
- لا تكسر public APIs بدون سبب وتوثيق.
- لا تنشئ microservice جديد.
- التزم ببنية:
  `api -> application -> domain -> infrastructure`
- لا تضع business rules في controller.
- لا تستخدم hard delete للبيانات التشغيلية أو الطبية.
- لا تتجاهل version أو audit أو idempotency.
- لا تخفِ فشلًا في الحفظ بإرجاع success وهمي.
- لا تستخدم `any` إلا عند ضرورة موثقة.
- لا تترك TODO أو placeholder.
- لا تعتبر endpoint موجودًا كافيًا؛ اختبر الرحلة كاملة من الفرونت حتى قاعدة البيانات.
- لا تعمل commit أو push.

## طريقة العمل الإلزامية

قبل التعديل:
- استخدم Serena لإعداد خريطة للرموز والمسارات.
- اذكر الفجوات الحالية بدقة.
- اكتب خطة تنفيذ قصيرة قابلة للتحقق.

أثناء التعديل:
- نفذ أصغر مجموعة تغييرات مترابطة.
- بعد كل تعديل مهم شغّل validation مركزًا.
- أصلح المشاكل قبل الانتقال لمسار آخر.

في النهاية أخرج تقريرًا يحتوي على:
- الملفات التي تغيرت.
- الـ endpoints الجديدة أو المعدلة.
- قواعد الصلاحيات.
- ما تم تنفيذه في الفرونت.
- الاختبارات التي نجحت.
- أي blockers حقيقية فقط.
- Mermaid diagrams النهائية.