# RBAC — чертёж бэкенда (Express + MySQL)

> **Статус:** проектный документ. Ничего из описанного здесь ещё не подключено к сайту —
> сейчас разграничение ролей реализовано только на фронтенде (см. раздел «Что уже сделано
> на фронтенде и почему этого недостаточно» ниже). Этот файл — чертёж для того момента,
> когда будет подниматься настоящий бэкенд с MySQL.

## 1. Роли

| Роль      | Код в БД  | Кто это |
|-----------|-----------|---------|
| Пациент   | `patient` | Зарегистрированный пациент, видит только свой кабинет |
| Врач      | `doctor`  | Обычный врач отделения, видит только приём своих пациентов |
| Админ     | `chief`   | Главный врач / администратор клиники, полный доступ |

## 2. Аутентификация: JWT

При логине (`POST /api/auth/login`) сервер проверяет пароль (bcrypt-хеш в БД) и выдаёт
JWT с полезной нагрузкой:

```json
{
  "sub": "u_482",
  "role": "doctor",
  "doctorId": "d_17",
  "deptId": "cardio",
  "iat": 1730000000,
  "exp": 1730003600
}
```

- `sub` — ID пользователя (users.id).
- `role` — одна из трёх ролей. Это и есть точка входа RBAC: все проверки доступа
  опираются на `req.user.role`, а не на то, что ввёл клиент.
- `doctorId` / `deptId` — только для врачей, нужны для скоупинга «только свои пациенты».
- Токен живёт недолго (например 1 час), обновляется через `refresh_token` в httpOnly-cookie.

Важно: роль **никогда** не принимается от клиента при логине или где-либо ещё —
её читают из таблицы `users` на сервере и подписывают в токен. Клиент не может
«назначить» себе роль.

## 3. Express middleware

```js
// middleware/auth.js
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const token = req.cookies.access_token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Не авторизован" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Токен недействителен или истёк" });
  }
}

// requireRole(["chief"]) — пускает только перечисленные роли
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Недостаточно прав для этого раздела" });
    }
    next();
  };
}

// requireOwnPatient — врач может читать карту только своего текущего пациента
// (сверяет appointment.doctor_id с req.user.doctorId, а не доверяет :patientId из URL)
async function requireOwnPatient(req, res, next) {
  if (req.user.role === "chief") return next(); // админ видит всё
  const appt = await db.query(
    "SELECT doctor_id FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1",
    [req.params.patientId, req.user.doctorId]
  );
  if (!appt.length) return res.status(403).json({ error: "Этот пациент не в вашём приёме" });
  next();
}

module.exports = { requireAuth, requireRole, requireOwnPatient };
```

## 4. Примеры защищённых роутов

```js
const { requireAuth, requireRole, requireOwnPatient } = require("./middleware/auth");

/* ---- Пациент ---- */
router.get("/api/me/appointments", requireAuth, requireRole(["patient"]), getMyAppointments);
router.get("/api/me/records",      requireAuth, requireRole(["patient"]), getMyRecords);
// публичные слоты записи — вообще без авторизации, но без привязки к врачу/пациенту
router.get("/api/public/slots",    getPublicSlots);

/* ---- Обычный врач ---- */
router.get("/api/doctor/schedule/today", requireAuth, requireRole(["doctor", "chief"]), getTodaySchedule);
router.get("/api/doctor/patients/:patientId",
  requireAuth, requireRole(["doctor", "chief"]), requireOwnPatient, getPatientChart);
router.post("/api/doctor/encounters",
  requireAuth, requireRole(["doctor", "chief"]), requireOwnPatient, createEncounter); // ЭМК: анамнез, МКБ-10, назначения

/* ---- Главный врач / Админ ---- */
router.get("/api/admin/staff",        requireAuth, requireRole(["chief"]), listStaff);
router.post("/api/admin/staff",       requireAuth, requireRole(["chief"]), createStaff); // регистрация персонала
router.get("/api/admin/patients",     requireAuth, requireRole(["chief"]), listAllPatients);
router.get("/api/admin/finance",      requireAuth, requireRole(["chief"]), getFinanceReport);
router.put("/api/admin/price-list",   requireAuth, requireRole(["chief"]), updatePriceList);
router.get("/api/admin/analytics",    requireAuth, requireRole(["chief"]), getClinicAnalytics);
```

Страница регистрации персонала на фронтенде должна не просто визуально прятаться —
её API-роут (`POST /api/admin/staff`) обязан быть за `requireRole(["chief"])`, иначе
прямой вызов API в обход интерфейса позволит кому угодно зарегистрировать сотрудника.

## 5. Схема MySQL (сокращённо)

```sql
CREATE TABLE roles (
  code VARCHAR(20) PRIMARY KEY   -- 'patient' | 'doctor' | 'chief'
);

CREATE TABLE users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  email         VARCHAR(190) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_code     VARCHAR(20) NOT NULL REFERENCES roles(code),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE doctors (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT UNIQUE REFERENCES users(id),
  dept_id     VARCHAR(40) NOT NULL,         -- 'cardio', 'neuro', ...
  full_name   VARCHAR(190) NOT NULL,
  title       VARCHAR(190)
);

CREATE TABLE patients (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT UNIQUE REFERENCES users(id),
  full_name  VARCHAR(190) NOT NULL,
  phone      VARCHAR(40),
  dob        DATE
);

CREATE TABLE appointments (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  doctor_id   BIGINT NOT NULL REFERENCES doctors(id),
  patient_id  BIGINT NOT NULL REFERENCES patients(id),
  slot_at     DATETIME NOT NULL,
  status      ENUM('pending','done','cancelled') DEFAULT 'pending',
  reason      VARCHAR(255),
  UNIQUE KEY uniq_doctor_slot (doctor_id, slot_at)   -- защита от двойной записи
);

-- ЭМК конкретного приёма: анамнез, диагноз МКБ-10, назначения.
-- Доступна только doctor_id этого приёма (или chief).
CREATE TABLE encounters (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  appointment_id BIGINT UNIQUE NOT NULL REFERENCES appointments(id),
  doctor_id      BIGINT NOT NULL REFERENCES doctors(id),
  patient_id     BIGINT NOT NULL REFERENCES patients(id),
  anamnesis      TEXT,
  icd10_code     VARCHAR(10),
  icd10_name     VARCHAR(255),
  treatment_note TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lab_orders (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  encounter_id   BIGINT REFERENCES encounters(id),
  test_name      VARCHAR(190),
  status         ENUM('ordered','in_progress','done') DEFAULT 'ordered',
  ordered_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Прайс-лист и финансы — только для chief (ни один route обычного врача к ним не обращается).
CREATE TABLE services (
  id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  dept_id   VARCHAR(40),
  name      VARCHAR(190),
  price     DECIMAL(10,2)
);

-- Аудит: кто и когда открывал чужую карту / менял прайс-лист и т.д.
CREATE TABLE audit_log (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT REFERENCES users(id),
  action     VARCHAR(100),      -- 'view_patient_chart', 'update_price_list', ...
  target_id  VARCHAR(100),
  at         DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Ключевая идея скоупинга «врач видит только своего пациента»: доступ к `encounters` /
`appointments` всегда идёт через `WHERE doctor_id = req.user.doctorId` (кроме `chief`),
а не через ID из URL напрямую — иначе подмена `patientId` в адресной строке дала бы
доступ к чужой карте.

## 6. Что уже сделано на фронтенде и почему этого недостаточно

В `doctor-cabinet.html` сейчас реализован **фронтенд-уровень** той же модели ролей,
на demo-данных в `localStorage` (бэкенда и реальной БД пока нет — по вашему решению
сначала фронтенд, бэкенд потом):

- У каждого демо-врача есть `role: "chief" | "doctor"`.
- Пункты меню (`Персонал`, `Лаборатория`, `Кабинеты`, `Лечение`, `Аптека`, `Пациенты`)
  физически не рендерятся в DOM для роли `doctor` — не просто скрыты через CSS.
- Центральная функция навигации `goTo(section)` — единая точка входа для переключения
  разделов — проверяет роль и отбрасывает обычного врача на дашборд, даже если
  вызвать её напрямую (не через клик по меню).
- Каждый обработчик раздела (`renderStaff`, `renderLab`, `renderPharmacy` и т.д.)
  дополнительно сам проверяет роль при рендере (`requireChief()`) — защита в
  несколько слоёв на тот случай, если первая проверка будет обойдена.
- Обычный врач при входе вообще не загружает в память базу персонала, прайс-лист
  аптеки и список кабинетов (не просто «не показывает» — данные не запрашиваются).
- Дашборд обычного врача показывает только его приёмы на сегодня и его личный
  график — без агрегированных по клинике чисел.
- Приём пациента (ЭМК) включает анамнез, диагноз по МКБ-10, назначения и направления
  на анализы — доступен обеим ролям, но только по собственному расписанию врача.
- У главного врача на дашборде — анимированные счётчики (0 → целевое значение)
  по всем ключевым метрикам клиники.

**Почему это не настоящая защита:** в чистом фронтенд-приложении без сервера любой
человек с открытой консолью браузера может отредактировать переменную `doctor.role`
в памяти страницы или достать любые данные прямо из `localStorage` — JavaScript
на странице полностью подконтролен пользователю. Сегодняшние проверки — это
демонстрация того, как будет выглядеть интерфейс и логика переключения ролей, а
не барьер для реальных данных. Настоящая защита начинается только тогда, когда
сервер (а не браузер) решает, какие данные вообще отдать в ответ — то есть когда
появится бэкенд с middleware `requireAuth` / `requireRole`, описанный выше.
