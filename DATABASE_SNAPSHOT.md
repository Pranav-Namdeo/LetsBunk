# 🗄️ Database Snapshot — 2026-05-07

> **Database:** `attendance_app`  
> **Backup created:** 2026-05-07T11:20:17.010Z  
> **Collections:** 24  
> **Total documents:** 5,655

---

## 📋 Table of Contents

- [attendanceaudits](#attendanceaudits)
- [attendancehistories](#attendancehistories)
- [attendancerecords](#attendancerecords)
- [attendances](#attendances)
- [attendancesessions](#attendancesessions)
- [classes](#classes)
- [classrooms](#classrooms)
- [configs](#configs)
- [dailyattendances](#dailyattendances)
- [holidays](#holidays)
- [logs](#logs)
- [periodattendances](#periodattendances)
- [randomrings](#randomrings)
- [schedules](#schedules)
- [settings](#settings)
- [studentmanagements](#studentmanagements)
- [students](#students)
- [subjects](#subjects)
- [systemsettings](#systemsettings)
- [teachers](#teachers)
- [timetablehistories](#timetablehistories)
- [timetables](#timetables)
- [users](#users)
- [verifications](#verifications)

---

## 📊 Overview

| Collection | Documents | File Size |
| --- | --- | --- |
| `attendanceaudits` | 7 | 4.5 KB |
| `attendancehistories` | 0 | 2 B |
| `attendancerecords` | 878 | 2.02 MB |
| `attendances` | 0 | 2 B |
| `attendancesessions` | 0 | 2 B |
| `classes` | 2 | 473 B |
| `classrooms` | 2 | 1.0 KB |
| `configs` | 11 | 2.8 KB |
| `dailyattendances` | 720 | 296.0 KB |
| `holidays` | 0 | 2 B |
| `logs` | 23 | 5.9 KB |
| `periodattendances` | 3,723 | 1.86 MB |
| `randomrings` | 15 | 15.6 KB |
| `schedules` | 2 | 613 B |
| `settings` | 2 | 409 B |
| `studentmanagements` | 27 | 24.1 KB |
| `students` | 0 | 2 B |
| `subjects` | 5 | 1.8 KB |
| `systemsettings` | 2 | 761 B |
| `teachers` | 2 | 855 B |
| `timetablehistories` | 228 | 93.8 KB |
| `timetables` | 2 | 17.4 KB |
| `users` | 4 | 5.1 KB |
| `verifications` | 0 | 2 B |

---

## attendanceaudits

**Documents:** 7 · **Size:** 4.5 KB

**Fields:** `_id`, `recordType`, `recordId`, `enrollmentNo`, `studentName`, `date`, `period`, `modifiedBy`, `modifierName`, `modifierRole`, `oldStatus`, `newStatus`, `changeType`, `reason`, `auditId`, `modifiedAt`, `createdAt`, `updatedAt`, `__v`

_Sample (3 of 7):_

```json
{
  "_id": "69d3510cc0865e4e832fc47d",
  "recordType": "period_attendance",
  "recordId": "69d3510cc0865e4e832fc47b",
  "enrollmentNo": "ad123",
  "studentName": "ad123",
  "date": "2026-04-06T00:00:00.000Z",
  "period": "P2",
  "modifiedBy": "ADMIN001",
  "modifierName": "Admin",
  "modifierRole": "teacher",
  "oldStatus": null,
  "newStatus": "present",
  "changeType": "create",
  "reason": "Manual marking by admin",
  "auditId": "audit_1775456524802_85ijjx89x",
  "modifiedAt": "2026-04-06T06:22:04.802Z",
  "createdAt": "2026-04-06T06:22:04.802Z",
  "updatedAt": "2026-04-06T06:22:04.802Z",
  "__v": 0
}
```

```json
{
  "_id": "69d3510dc0865e4e832fc482",
  "recordType": "period_attendance",
  "recordId": "69d3510dc0865e4e832fc480",
  "enrollmentNo": "ad123",
  "studentName": "ad123",
  "date": "2026-04-06T00:00:00.000Z",
  "period": "P3",
  "modifiedBy": "ADMIN001",
  "modifierName": "Admin",
  "modifierRole": "teacher",
  "oldStatus": null,
  "newStatus": "present",
  "changeType": "create",
  "reason": "Manual marking by admin",
  "auditId": "audit_1775456525522_5vamdfh1r",
  "modifiedAt": "2026-04-06T06:22:05.522Z",
  "createdAt": "2026-04-06T06:22:05.522Z",
  "updatedAt": "2026-04-06T06:22:05.522Z",
  "__v": 0
}
```

```json
{
  "_id": "69d3510ec0865e4e832fc487",
  "recordType": "period_attendance",
  "recordId": "69d3510dc0865e4e832fc485",
  "enrollmentNo": "ad123",
  "studentName": "ad123",
  "date": "2026-04-06T00:00:00.000Z",
  "period": "P4",
  "modifiedBy": "ADMIN001",
  "modifierName": "Admin",
  "modifierRole": "teacher",
  "oldStatus": null,
  "newStatus": "present",
  "changeType": "create",
  "reason": "Manual marking by admin",
  "auditId": "audit_1775456526223_raczb40b5",
  "modifiedAt": "2026-04-06T06:22:06.223Z",
  "createdAt": "2026-04-06T06:22:06.223Z",
  "updatedAt": "2026-04-06T06:22:06.223Z",
  "__v": 0
}
```

---

## attendancehistories

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---

## attendancerecords

**Documents:** 878 · **Size:** 2.02 MB

**Fields:** `_id`, `date`, `__v`, `branch`, `createdAt`, `dayPercentage`, `enrollmentNo`, `lectures`, `semester`, `status`, `studentId`, `studentName`, `timerValue`, `totalAttended`, `totalClassTime`, `updatedAt`

| Enrollment | Name | Days | Present | Absent | Rate |
| --- | --- | --- | --- | --- | --- |
| ad123 | ad123 | 21 | 6 | 15 | 29% |
| PRA123 | PRANAV | 14 | 1 | 13 | 7% |
| ak123 | aksh | 3 | 0 | 3 | 0% |
| BTC3001 | Aditya Singh | 36 | 0 | 36 | 0% |
| BTC3002 | Priya Sharma | 36 | 30 | 6 | 83% |
| BTC3003 | Rahul Verma | 36 | 30 | 6 | 83% |
| BTC3004 | Sneha Patel | 36 | 30 | 6 | 83% |
| BTD3001 | Arjun Mehta | 36 | 30 | 6 | 83% |
| BTD3002 | Kavya Nair | 36 | 30 | 6 | 83% |
| BTD3003 | Rohan Das | 36 | 0 | 36 | 0% |
| BTD3004 | Ananya Joshi | 36 | 0 | 36 | 0% |
| BTI3001 | Vikram Rao | 36 | 30 | 6 | 83% |
| BTI3002 | Pooja Iyer | 36 | 30 | 6 | 83% |
| BTI3003 | Karan Malhotra | 36 | 30 | 6 | 83% |
| BTI3004 | Divya Reddy | 36 | 30 | 6 | 83% |
| DS1001 | Aditya Singh | 36 | 30 | 6 | 83% |
| DS1002 | Priya Sharma | 36 | 30 | 6 | 83% |
| DS1003 | Rahul Verma | 36 | 30 | 6 | 83% |
| DS1004 | Sneha Patel | 36 | 30 | 6 | 83% |
| DS2001 | Arjun Mehta | 36 | 30 | 6 | 83% |
| DS2002 | Kavya Nair | 36 | 30 | 6 | 83% |
| DS2003 | Rohan Das | 36 | 30 | 6 | 83% |
| DS2004 | Ananya Joshi | 36 | 30 | 6 | 83% |
| DS3001 | Vikram Rao | 30 | 30 | 0 | 100% |
| DS3002 | Pooja Iyer | 30 | 30 | 0 | 100% |
| DS3003 | Karan Malhotra | 30 | 30 | 0 | 100% |
| DS3004 | Divya Reddy | 30 | 30 | 0 | 100% |

---

## attendances

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---

## attendancesessions

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---

## classes

**Documents:** 2 · **Size:** 473 B

**Fields:** `_id`, `classId`, `name`, `semester`, `branch`, `room`, `wifiId`, `active`, `__v`

_Sample (2 of 2):_

```json
{
  "_id": "69a1dcb4f08a3ac1d5d4f3cc",
  "classId": "CLS-1772215476243-66rm6lotb",
  "name": "Semester 3 - Computer Science",
  "semester": "3",
  "branch": "Computer Science",
  "room": "R301",
  "wifiId": "WIFI-CS-301",
  "active": true,
  "__v": 0
}
```

```json
{
  "_id": "69a1ecd698b8cc821da88b88",
  "classId": "CLS-1772219606278-ahvi6m2iv",
  "name": "Test Class",
  "semester": "1",
  "branch": "CSE",
  "active": true,
  "__v": 0
}
```

---

## classrooms

**Documents:** 2 · **Size:** 1.0 KB

**Fields:** `_id`, `roomNumber`, `building`, `capacity`, `wifiBSSIDs`, `isActive`, `createdAt`, `__v`

| Room | Building | Capacity | BSSIDs | Active |
| --- | --- | --- | --- | --- |
| A101 | ADI GHAR | 7e+21 | ee:ee:6d:9d:6f:ba, b4:86:18:6f:fb:ec, b4:86:18:6f:fb:eb, ce:75:5a:57:0b:82, fe:9f:1c:92:d7:8b | ✅ |
| A102 | BHAIYA GHAR | 100000000000000 | 0a:aa:89:97:49:d8, ee:1a:d8:58:40:00, ee:ee:6d:9d:6f:ba, b4:86:18:6f:fb:ec, b4:86:18:6f:fb:eb, 00:00:00:00:00:00, 08:aa:89:a7:49:d8, 08:aa:89:a7:49:da, 8a:4f:66:48:4a:7d, 8a:4f:66:48:4a:7e, 4a:63:34:a7:f6:a8, a4:2a:95:9a:d9:c3, 92:37:73:97:e8:e3, fe:9f:1c:92:d7:8b, 12:18:46:f8:7d:5a, ce:75:5a:57:0b:82 | ✅ |

---

## configs

**Documents:** 11 · **Size:** 2.8 KB

**Fields:** `_id`, `type`, `value`, `displayName`, `isActive`, `createdAt`, `updatedAt`, `__v`

**Branchs:**

| Value | Display Name | Active |
| --- | --- | --- |
| DS | DATA SCIENCE | ✅ |
| ai/ml | artificial intelligence | ✅ |
| B.Tech Computer Science | B.Tech Computer Science | ✅ |
| B.Tech Data Science | B.Tech Data Science | ✅ |
| B.Tech Information Technology | B.Tech Information Technology | ✅ |

**Semesters:**

| Value | Display Name | Active |
| --- | --- | --- |
| 1 | Semester 1 | ✅ |
| 2 | Semester 2 | ✅ |
| 3 | Semester 3 | ✅ |
| 4 | Semester 4 | ✅ |
| 5 | Semester 5 | ✅ |

**Departments:**

| Value | Display Name | Active |
| --- | --- | --- |
| CSE | COMPUTER SCIENCE | ✅ |


---

## dailyattendances

**Documents:** 720 · **Size:** 296.0 KB

**Fields:** `_id`, `date`, `enrollmentNo`, `__v`, `absentPeriods`, `attendancePercentage`, `branch`, `calculatedAt`, `dailyStatus`, `presentPeriods`, `semester`, `studentName`, `threshold`, `totalPeriods`

_Sample (3 of 720):_

```json
{
  "_id": "69d66d0061da4f175aedc653",
  "date": "2026-04-06T18:30:00.000Z",
  "enrollmentNo": "BTC3001",
  "__v": 0,
  "absentPeriods": 6,
  "attendancePercentage": 0,
  "branch": "B.Tech Computer Science",
  "calculatedAt": "2026-04-08T15:21:03.091Z",
  "dailyStatus": "absent",
  "presentPeriods": 0,
  "semester": "3",
  "studentName": "Aditya Singh",
  "threshold": 75,
  "totalPeriods": 6
}
```

```json
{
  "_id": "69d66d0361da4f175aedc65b",
  "date": "2026-04-05T18:30:00.000Z",
  "enrollmentNo": "BTC3001",
  "__v": 0,
  "absentPeriods": 6,
  "attendancePercentage": 0,
  "branch": "B.Tech Computer Science",
  "calculatedAt": "2026-04-08T15:21:03.091Z",
  "dailyStatus": "absent",
  "presentPeriods": 0,
  "semester": "3",
  "studentName": "Aditya Singh",
  "threshold": 75,
  "totalPeriods": 6
}
```

```json
{
  "_id": "69d66d0461da4f175aedc663",
  "enrollmentNo": "BTC3001",
  "date": "2026-04-03T18:30:00.000Z",
  "__v": 0,
  "absentPeriods": 6,
  "attendancePercentage": 0,
  "branch": "B.Tech Computer Science",
  "calculatedAt": "2026-04-08T15:21:03.091Z",
  "dailyStatus": "absent",
  "presentPeriods": 0,
  "semester": "3",
  "studentName": "Aditya Singh",
  "threshold": 75,
  "totalPeriods": 6
}
```

---

## holidays

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---

## logs

**Documents:** 23 · **Size:** 5.9 KB

**Fields:** `_id`, `logId`, `action`, `userId`, `targetId`, `details`, `timestamp`, `__v`

_Sample (3 of 23):_

```json
{
  "_id": "69a1dcb3f08a3ac1d5d4f3bc",
  "logId": "LOG-1772215475008-e1l4auain",
  "action": "user_created",
  "userId": "SYSTEM",
  "targetId": "ADMIN001",
  "details": {
    "role": "admin"
  },
  "timestamp": "2026-02-27T18:04:35.008Z",
  "__v": 0
}
```

```json
{
  "_id": "69a1dcb3f08a3ac1d5d4f3bf",
  "logId": "LOG-1772215475368-li9gss7vv",
  "action": "login",
  "userId": "ADMIN001",
  "targetId": null,
  "details": {
    "role": "admin"
  },
  "timestamp": "2026-02-27T18:04:35.368Z",
  "__v": 0
}
```

```json
{
  "_id": "69a1dcb3f08a3ac1d5d4f3c4",
  "logId": "LOG-1772215475663-wyo808xu4",
  "action": "user_created",
  "userId": "ADMIN001",
  "targetId": "T001",
  "details": {
    "role": "teacher"
  },
  "timestamp": "2026-02-27T18:04:35.663Z",
  "__v": 0
}
```

---

## periodattendances

**Documents:** 3,723 · **Size:** 1.86 MB

**Fields:** `_id`, `period`, `enrollmentNo`, `date`, `__v`, `branch`, `createdAt`, `faceVerified`, `room`, `semester`, `status`, `studentName`, `subject`, `teacher`, `teacherName`, `updatedAt`, `verificationType`, `wifiVerified`

_Showing last 20 days (43 total days in DB)_

| Date | Total Records | Present | Absent | Rate |
| --- | --- | --- | --- | --- |
| 2026-05-06 | 9 | 2 | 7 | 22% |
| 2026-05-05 | 11 | 0 | 11 | 0% |
| 2026-05-04 | 8 | 2 | 6 | 25% |
| 2026-05-03 | 8 | 4 | 4 | 50% |
| 2026-04-23 | 1 | 1 | 0 | 100% |
| 2026-04-22 | 1 | 1 | 0 | 100% |
| 2026-04-17 | 8 | 1 | 7 | 13% |
| 2026-04-16 | 3 | 1 | 2 | 33% |
| 2026-04-14 | 6 | 2 | 4 | 33% |
| 2026-04-10 | 2 | 1 | 1 | 50% |
| 2026-04-09 | 3 | 1 | 2 | 33% |
| 2026-04-08 | 10 | 2 | 8 | 20% |
| 2026-04-06 | 129 | 111 | 18 | 86% |
| 2026-04-05 | 134 | 109 | 25 | 81% |
| 2026-04-04 | 14 | 8 | 6 | 57% |
| 2026-04-03 | 127 | 102 | 25 | 80% |
| 2026-04-02 | 126 | 104 | 22 | 83% |
| 2026-04-01 | 123 | 102 | 21 | 83% |
| 2026-03-31 | 120 | 102 | 18 | 85% |
| 2026-03-30 | 120 | 102 | 18 | 85% |

---

## randomrings

**Documents:** 15 · **Size:** 15.6 KB

**Fields:** `_id`, `ringId`, `teacherId`, `teacherName`, `semester`, `branch`, `period`, `targetType`, `studentCount`, `selectedStudents`, `triggeredAt`, `expiresAt`, `status`, `totalResponses`, `successfulVerifications`, `failedVerifications`, `noResponses`, `createdAt`, `__v`, `completedAt`

| Ring ID | Teacher | Sem | Branch | Period | Students | Verified | Status | Triggered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s3j72ynl | ka123 | 3 | DS | P3 | 1 | 0 | expired | 2026-04-02 09:37:19 |
| zpbu0kbk | ka123 | 3 | DS | P7 | 1 | 0 | expired | 2026-04-05 18:14:04 |
| n0jv1zcp | ka123 | 3 | DS | P7 | 1 | 1 | expired | 2026-04-05 18:14:30 |
| rnrljr7f | ka123 | 3 | DS | P7 | 1 | 0 | expired | 2026-04-05 18:14:46 |
| 41dcc2fo | ka123 | 3 | DS | P7 | 1 | 0 | expired | 2026-04-05 18:19:27 |
| nsn8x274 | ka123 | 3 | DS | P3 | 1 | 0 | expired | 2026-04-16 13:47:26 |
| xttmssp8 | ka123 | 3 | DS | P3 | 1 | 1 | expired | 2026-04-16 13:48:54 |
| 3x7t2mmx | ka123 | 3 | DS | P3 | 1 | 0 | expired | 2026-04-16 13:50:07 |
| ozrv9ye6 | ka123 | 3 | DS | P3 | 2 | 1 | expired | 2026-05-04 07:39:41 |
| qc08hxx2 | ka123 | 3 | DS | P3 | 1 | 1 | expired | 2026-05-04 08:33:21 |
| n6f7w1kr | ka123 | 3 | DS | P4 | 1 | 0 | expired | 2026-05-06 21:57:16 |
| 2ubg3htz | meow | 3 | ai/ml | P4 | 1 | 0 | expired | 2026-05-06 21:58:19 |
| qxonxgzo | meow | 3 | ai/ml | P5 | 1 | 0 | expired | 2026-05-06 22:31:25 |
| lpcdbdvo | meow | 3 | ai/ml | P1 | 1 | 1 | expired | 2026-05-07 10:17:50 |
| 8ipukwae | meow | 3 | ai/ml | P2 | 1 | 0 | expired | 2026-05-07 10:59:12 |

---

## schedules

**Documents:** 2 · **Size:** 613 B

**Fields:** `_id`, `scheduleId`, `classId`, `teacherId`, `subject`, `day`, `slot`, `startTime`, `endTime`, `active`, `__v`

_Sample (2 of 2):_

```json
{
  "_id": "69a1dcb4f08a3ac1d5d4f3d0",
  "scheduleId": "SCH-1772215476446-m6iir2up6",
  "classId": "CLS-1772215476243-66rm6lotb",
  "teacherId": "T001",
  "subject": "Data Structures",
  "day": "monday",
  "slot": 1,
  "startTime": "08:30",
  "endTime": "09:30",
  "active": true,
  "__v": 0
}
```

```json
{
  "_id": "69a1ecd798b8cc821da88b90",
  "scheduleId": "SCH-1772219607081-oukauxhdq",
  "classId": "CLS-123",
  "teacherId": "T001",
  "subject": "Math",
  "day": "monday",
  "slot": 1,
  "startTime": "09:00",
  "endTime": "10:00",
  "active": true,
  "__v": 0
}
```

---

## settings

**Documents:** 2 · **Size:** 409 B

**Fields:** `_id`, `key`, `__v`, `updatedAt`, `value`

| Key | Value | Description | Updated |
| --- | --- | --- | --- |
| test_key | test_value | — | 2026-02-27 19:13:33 |
| periods_config | [object Object] | — | 2026-02-27 19:13:34 |

---

## studentmanagements

**Documents:** 27 · **Size:** 24.1 KB

**Fields:** `_id`, `enrollmentNo`, `name`, `email`, `branch`, `semester`, `dob`, `phone`, `isActive`, `status`, `attendanceSession`, `createdAt`, `lastUpdated`, `attendanceBackup`, `__v`, `faceEnrolledAt`

| Enrollment | Name | Branch | Sem | Email | Active | Face | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ak123 | aksh | DS | 3 | aksh@gmail.com | ✅ | ✅ | absent |
| ad123 | ad123 | ai/ml | 3 | ad@gmail.com | ✅ | ✅ | present |
| PRA123 | PRANAV | DS | 3 | PRANAV@GMAIL.COM | ✅ | ✅ | absent |
| BTC3001 | Aditya Singh | B.Tech Computer Science | 3 | — | ❌ | ❌ | — |
| BTC3002 | Priya Sharma | B.Tech Computer Science | 3 | — | ❌ | ❌ | — |
| BTC3003 | Rahul Verma | B.Tech Computer Science | 3 | — | ❌ | ❌ | — |
| BTC3004 | Sneha Patel | B.Tech Computer Science | 3 | — | ❌ | ❌ | — |
| BTD3001 | Arjun Mehta | B.Tech Data Science | 3 | — | ❌ | ❌ | — |
| BTD3002 | Kavya Nair | B.Tech Data Science | 3 | — | ❌ | ❌ | — |
| BTD3003 | Rohan Das | B.Tech Data Science | 3 | — | ❌ | ❌ | — |
| BTD3004 | Ananya Joshi | B.Tech Data Science | 3 | — | ❌ | ❌ | — |
| BTI3001 | Vikram Rao | B.Tech Information Technology | 3 | — | ❌ | ❌ | — |
| BTI3002 | Pooja Iyer | B.Tech Information Technology | 3 | — | ❌ | ❌ | — |
| BTI3003 | Karan Malhotra | B.Tech Information Technology | 3 | — | ❌ | ❌ | — |
| BTI3004 | Divya Reddy | B.Tech Information Technology | 3 | — | ❌ | ❌ | — |
| DS1001 | Aditya Singh | DS | 1 | — | ❌ | ❌ | — |
| DS1002 | Priya Sharma | DS | 1 | — | ❌ | ❌ | — |
| DS1003 | Rahul Verma | DS | 1 | — | ❌ | ❌ | — |
| DS1004 | Sneha Patel | DS | 1 | — | ❌ | ❌ | — |
| DS2001 | Arjun Mehta | DS | 2 | — | ❌ | ❌ | — |
| DS2002 | Kavya Nair | DS | 2 | — | ❌ | ❌ | — |
| DS2003 | Rohan Das | DS | 2 | — | ❌ | ❌ | — |
| DS2004 | Ananya Joshi | DS | 2 | — | ❌ | ❌ | — |
| DS3001 | Vikram Rao | DS | 3 | — | ❌ | ❌ | — |
| DS3002 | Pooja Iyer | DS | 3 | — | ❌ | ❌ | — |
| DS3003 | Karan Malhotra | DS | 3 | — | ❌ | ❌ | — |
| DS3004 | Divya Reddy | DS | 3 | — | ❌ | ❌ | — |

---

## students

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---

## subjects

**Documents:** 5 · **Size:** 1.8 KB

**Fields:** `_id`, `subjectCode`, `subjectName`, `shortName`, `semester`, `branch`, `credits`, `type`, `description`, `isActive`, `createdAt`, `updatedAt`, `__v`

| Code | Name | Short | Sem | Branch | Type | Active |
| --- | --- | --- | --- | --- | --- | --- |
| DS301 | DATA SCIENCE | DS | 3 | DS | Theory | ✅ |
| CS302 | STRUCTURES | DSA | 3 | DS | Theory | ✅ |
| ENGLISH | ENGLISH | ENG | 3 | DS | Theory | ✅ |
| AI202 | artificial intelligence | ai | 3 | ai/ml | Theory | ✅ |
| MATHS | maths | math | 3 | DS | Theory | ✅ |

---

## systemsettings

**Documents:** 2 · **Size:** 761 B

**Fields:** `_id`, `settingKey`, `settingValue`, `dataType`, `description`, `minValue`, `maxValue`, `lastModifiedBy`, `lastModifiedAt`, `updatedBy`, `updatedAt`, `createdAt`, `__v`

| Key | Value | Description | Updated |
| --- | --- | --- | --- |
| daily_threshold | 60 | Minimum percentage of periods required for daily present status | 2026-05-05 18:46:53 |
| attendance_threshold | 75 | Minimum attendance percentage required to mark student as present | 2026-03-12 13:30:07 |

---

## teachers

**Documents:** 2 · **Size:** 855 B

**Fields:** `_id`, `employeeId`, `name`, `email`, `department`, `subject`, `subjects`, `dob`, `phone`, `canEditTimetable`, `createdAt`, `__v`, `semester`

| Employee ID | Name | Email | Dept | Subjects | Can Edit TT |
| --- | --- | --- | --- | --- | --- |
| ka123 | kaka | ka@gmail.com | CSE | STRUCTURES, DATA SCIENCE | ✅ |
| meow | meow | meow@gmail.com | CSE | STRUCTURES, DATA SCIENCE | ❌ |

---

## timetablehistories

**Documents:** 228 · **Size:** 93.8 KB

**Fields:** `_id`, `date`, `branch`, `semester`, `period`, `__v`, `createdAt`, `endTime`, `room`, `source`, `startTime`, `subject`, `teacher`, `teacherName`, `updatedAt`

_Sample (3 of 228):_

```json
{
  "_id": "69d055ac61da4f175aedbcd2",
  "date": "2026-04-04T00:00:00.000Z",
  "branch": "DS",
  "semester": "3",
  "period": "P1",
  "__v": 0,
  "createdAt": "2026-04-04T00:05:00.045Z",
  "endTime": "01:50",
  "room": "A102",
  "source": "cron",
  "startTime": "00:00",
  "subject": "DATA SCIENCE",
  "teacher": "kaka",
  "teacherName": "kaka",
  "updatedAt": "2026-04-04T00:05:00.227Z"
}
```

```json
{
  "_id": "69d055ac61da4f175aedbcd3",
  "branch": "DS",
  "semester": "3",
  "period": "P2",
  "date": "2026-04-04T00:00:00.000Z",
  "__v": 0,
  "createdAt": "2026-04-04T00:05:00.081Z",
  "endTime": "09:30",
  "room": "A102",
  "source": "cron",
  "startTime": "01:50",
  "subject": "STRUCTURES",
  "teacher": "meow",
  "teacherName": "meow",
  "updatedAt": "2026-04-04T00:05:00.443Z"
}
```

```json
{
  "_id": "69d055ac61da4f175aedbcd4",
  "branch": "DS",
  "semester": "3",
  "period": "P3",
  "date": "2026-04-04T00:00:00.000Z",
  "__v": 0,
  "createdAt": "2026-04-04T00:05:00.088Z",
  "endTime": "10:15",
  "room": "A101",
  "source": "cron",
  "startTime": "09:30",
  "subject": "DATA SCIENCE",
  "teacher": "kaka",
  "teacherName": "kaka",
  "updatedAt": "2026-04-04T00:05:00.655Z"
}
```

---

## timetables

**Documents:** 2 · **Size:** 17.4 KB

**Fields:** `_id`, `semester`, `branch`, `periods`, `timetable`, `lastUpdated`, `__v`

**Semester 3 — DS**

| # | Start | End |
| --- | --- | --- |
| P1 | 15:40 | 15:50 |
| P2 | 15:50 | 16:50 |
| P3 | 16:50 | 17:50 |
| P4 | 17:50 | 18:50 |
| P5 | 18:50 | 19:50 |

_Sunday:_ P1:ENGLISH(kaka) · P2:ENGLISH(kaka) · P3:ENGLISH(kaka) · P4:ENGLISH(kaka) · P5:ENGLISH(kaka) · P6:ENGLISH(kaka) · P7:ENGLISH(kaka) · P8:ENGLISH(kaka)

_Monday:_ P1:ENGLISH(kaka) · P2:ENGLISH(kaka) · P3:ENGLISH(kaka) · P4:ENGLISH(kaka) · P5:ENGLISH(kaka)

_Tuesday:_ P1:DATA SCIENCE(kaka) · P2:ENGLISH(kaka) · P3:ENGLISH(kaka) · P4:ENGLISH(kaka) · P5:ENGLISH(kaka)

**Semester 3 — ai/ml**

| # | Start | End |
| --- | --- | --- |
| P1 | 15:40 | 15:50 |
| P2 | 15:50 | 16:50 |
| P3 | 16:50 | 17:50 |
| P4 | 17:50 | 18:50 |
| P5 | 18:50 | 19:50 |

_Sunday:_ P1:artificial intelligence(meow) · P2:artificial intelligence(meow) · P3:artificial intelligence(meow) · P4:artificial intelligence(meow) · P5:artificial intelligence(meow) · P6:artificial intelligence(meow)

_Monday:_ P1:artificial intelligence(meow) · P2:artificial intelligence(meow) · P3:artificial intelligence(meow) · P4:artificial intelligence(meow) · P5:artificial intelligence(meow)

_Tuesday:_ P1:artificial intelligence(meow) · P2:artificial intelligence(meow) · P3:artificial intelligence(meow) · P4:artificial intelligence(meow) · P5:artificial intelligence(meow)


---

## users

**Documents:** 4 · **Size:** 5.1 KB

**Fields:** `_id`, `userId`, `role`, `name`, `email`, `phone`, `faceData`, `subjects`, `isAdmin`, `active`, `createdAt`, `__v`

| Username/Email | Role | Created |
| --- | --- | --- |
| admin@college.edu | admin | 2026-02-27 18:04:34 |
| t001@college.edu | teacher | 2026-02-27 18:04:35 |
| s001@student.edu | student | 2026-02-27 18:04:35 |
| — | student | 2026-02-27 19:13:24 |

---

## verifications

**Documents:** 0 · **Size:** 2 B

_Empty collection._
---
# API Endpoints Documentation

> **Server File**: `server.js` (9601 lines)
> **Total Server Endpoints**: 137 (includes duplicate route registrations)
> **Unique Server Endpoints**: ~111
> **Frontend API Calls Found**: 52 unique paths

---

## Issue Found

### 🚨 MISSING ENDPOINT
| Endpoint | Called By | Status |
|----------|-----------|--------|
| `POST /api/attendance/sync-offline` | App.js:1470 | **NOT FOUND** in server.js |

This endpoint is called in App.js but doesn't exist in server.js!

---

## Dead Endpoints (exist in server but NEVER called by frontend)

1. `/api/config` - SDUI config (uses /api/config/app instead)
2. `/api/timetable/:semester/*` - Wildcard route (rarely used)
3. `/api/teacher/current-lecture/:teacherId` - Not called
4. `/api/teacher/allowed-branches/:teacherId` - Not called
5. `/api/teacher-schedule/:teacherId/:day` - Not called
6. `/api/subjects/grouped/by-semester-branch` - Not called
7. `/api/attendance/start-session` - Legacy
8. `/api/attendance/lecture-start` - Not called
9. `/api/attendance/lecture-end` - Not called
10. `/api/attendance/add-verification` - Not called
11. `/api/attendance/period-report` - Not called
12. `/api/attendance/monthly-report` - Not called
13. `/api/attendance/audit-trail` - Not called
14. `/api/timetable-history/day` - Not called
15. `/api/random-ring/verify` - Uses verify-direct instead
16. `/api/random-ring/history/:teacherId` - Not called
17. `/api/settings` - Not called
18. `/api/db/wipe-all` - Admin-only, disabled
19. `/api/verify-face*` - All disabled
20. `/api/face-descriptor/:userId` - Disabled

## Summary by HTTP Method (Server)

| Method | Count |
|--------|-------|
| GET    | 62    |
| POST   | 58    |
| PUT    | 20    |
| DELETE | 10    |
| **Total** | **137** |

---

## GET Endpoints (62)

| # | Endpoint | Line |
|---|----------|------|
| 1 | `GET /` | 5175 |
| 2 | `GET /api/health` | 5194 |
| 3 | `GET /api/time` | 5205 |
| 4 | `GET /api/config` | 5222 |
| 5 | `GET /api/config/branches` | 5266, 5869 |
| 6 | `GET /api/config/semesters` | 5266, 5897 |
| 7 | `GET /api/config/departments` | 5424 |
| 8 | `GET /api/config/academic-year` | 5532 |
| 9 | `GET /api/config/app` | 5559 |
| 10 | `GET /api/settings` | 5222 |
| 11 | `GET /api/settings/attendance-threshold` | 5445, 7544 |
| 12 | `GET /api/students` | 5844 |
| 13 | `GET /api/students/:studentId/face-data` | 2790 |
| 14 | `GET /api/student-management` | 6096 |
| 15 | `GET /api/student/validate` | 6547 |
| 16 | `GET /api/view-records/students` | 6125 |
| 17 | `GET /api/teachers` | 6642 |
| 18 | `GET /api/timetables` | 630 |
| 19 | `GET /api/timetable/:semester/*` | 648 |
| 20 | `GET /api/timetable/:semester/:branch` | 670 |
| 21 | `GET /api/timetable/current-period` | 702 |
| 22 | `GET /api/periods` | 1076 |
| 23 | `GET /api/subjects` | 1102 |
| 24 | `GET /api/subjects/:subjectCode` | 1125 |
| 25 | `GET /api/subjects/grouped/by-semester-branch` | 1286 |
| 26 | `GET /api/teacher/current-lecture/:teacherId` | 829 |
| 27 | `GET /api/teacher/allowed-branches/:teacherId` | 921 |
| 28 | `GET /api/teacher/current-class-students/:teacherId` | 1375 |
| 29 | `GET /api/teacher-schedule/:teacherId/:day` | 1315 |
| 30 | `GET /api/attendance/stats` | 4342 |
| 31 | `GET /api/attendance/date/:date` | 4390 |
| 32 | `GET /api/attendance/date/:date/subject/:subject` | 4853 |
| 33 | `GET /api/attendance/period-report` | 3706 |
| 34 | `GET /api/attendance/daily-report` | 3774 |
| 35 | `GET /api/attendance/monthly-report` | 3873 |
| 36 | `GET /api/attendance/export` | 3944, 9440 |
| 37 | `GET /api/attendance/audit-trail` | 4005 |
| 38 | `GET /api/attendance/records` | 7978 |
| 39 | `GET /api/attendance/date-range` | 8099 |
| 40 | `GET /api/attendance/summary/:enrollmentNo` | 8155 |
| 41 | `GET /api/attendance/student/:enrollmentNo/dates` | 6884 |
| 42 | `GET /api/attendance/student/:enrollmentNo/date/:date` | 6992 |
| 43 | `GET /api/attendance/student/:enrollmentNo/date/:date/lecture/:period` | 7043 |
| 44 | `GET /api/attendance/student/:enrollmentNo/subject-stats` | 4503 |
| 45 | `GET /api/attendance/subjects` | 4538 |
| 46 | `GET /api/attendance/subject-dates` | 4566 |
| 47 | `GET /api/attendance/teacher/:teacherId/lectures` | 7102 |
| 48 | `GET /api/attendance/history/:enrollmentNo` | 7898 |
| 49 | `GET /api/attendance/authorized-bssid/:studentId` | 7265 |
| 50 | `GET /api/daily-bssid-schedule` | 5922 |
| 51 | `GET /api/timetable-history/day` | 4608 |
| 52 | `GET /api/holidays` | 8271 |
| 53 | `GET /api/holidays/range` | 8340 |
| 54 | `GET /api/classrooms` | 8361 |
| 55 | `GET /api/random-ring/history/:teacherId` | 7827 |
| 56 | `GET /api/enrollments` | 6488 |
| 57 | `GET /api/enrollment/:enrollmentNo` | 6377 |
| 58 | `GET /api/face-descriptor/:userId` | 5146 |
| 59 | `GET /api/departments` | 9403 |
| 60 | `GET /api/photo/:filename` | 6257 |
| 61 | `GET /api/attendance/all` | 9554 |
| 62 | `GET /api/attendance/manage` | 9136 |

---

## POST Endpoints (58)

| # | Endpoint | Line |
|---|----------|------|
| 1 | `POST /api/login` | 5619 |
| 2 | `POST /api/student/register` | 599 |
| 3 | `POST /api/students` | 6270 |
| 4 | `POST /api/students/bulk` | 6295 |
| 5 | `POST /api/teachers` | 6656 |
| 6 | `POST /api/teachers/bulk` | 6723 |
| 7 | `POST /api/timetable` | 745 |
| 8 | `POST /api/periods/update-all` | 974 |
| 9 | `POST /api/subjects` | 1141 |
| 10 | `POST /api/admin/purge-orphan-subjects` | 1233 |
| 11 | `POST /api/refresh-profile` | 2693 |
| 12 | `POST /api/attendance/check-in` | 2168 |
| 13 | `POST /api/attendance/record` | 2592 |
| 14 | `POST /api/attendance/offline-sync` | 2843 |
| 15 | `POST /api/attendance/period-sync` | 3250 |
| 16 | `POST /api/attendance/random-ring-response` | 3327 |
| 17 | `POST /api/attendance/manual-mark` | 3381 |
| 18 | `POST /api/attendance/start-session` | 4062 |
| 19 | `POST /api/attendance/lecture-start` | 4183 |
| 20 | `POST /api/attendance/lecture-end` | 4231 |
| 21 | `POST /api/attendance/add-verification` | 4305 |
| 22 | `POST /api/attendance/wifi-event` | 7203 |
| 23 | `POST /api/attendance/validate-bssid` | 7336 |
| 24 | `POST /api/attendance/history/period` | 8024 |
| 25 | `POST /api/attendance/manage` | 9186 |
| 26 | `POST /api/attendance/manage/bulk-operation` | 8353 |
| 27 | `POST /api/attendance/calculate-daily` | 9033 |
| 28 | `POST /api/random-ring` | 8463 |
| 29 | `POST /api/random-ring/verify` | 8616 |
| 30 | `POST /api/random-ring/verify-direct` | 8674 |
| 31 | `POST /api/random-ring/verify-after-rejection` | 8742 |
| 32 | `POST /api/random-ring/teacher-action` | 8857 |
| 33 | `POST /api/enrollment` | 6321 |
| 34 | `POST /api/enrollment/verify` | 6510 |
| 35 | `POST /api/verify-face` | 4943 |
| 36 | `POST /api/verify-face-proof` | 5154 |
| 37 | `POST /api/upload-photo` | 6223 |
| 38 | `POST /api/timetable-history/backfill` | 4638 |
| 39 | `POST /api/config/branches` | 5291 |
| 40 | `POST /api/config/semesters` | 5371 |
| 41 | `POST /api/config/departments` | 5452 |
| 42 | `POST /api/db/migrate` | 4712 |
| 43 | `POST /api/db/resync-attendance` | 4772 |
| 44 | `POST /api/db/wipe-all` | 4804 |
| 45 | `POST /api/holidays` | 8285 |
| 46 | `POST /api/classrooms` | 8375 |
| 47 | `POST /api/settings/attendance-threshold` | 7403 |

---

## PUT Endpoints (20)

| # | Endpoint | Line |
|---|----------|------|
| 1 | `PUT /api/timetable/:semester/:branch` | 777 |
| 2 | `PUT /api/subjects/:subjectCode` | 1179 |
| 3 | `PUT /api/subjects/bulk-update` | 9095 |
| 4 | `PUT /api/students/:id` | 6572 |
| 5 | `PUT /api/teachers/:id` | 6821 |
| 6 | `PUT /api/teachers/:id/timetable-access` | 6807 |
| 7 | `PUT /api/enrollment/:enrollmentNo` | 6414 |
| 8 | `PUT /api/config/branches/:id` | 5317 |
| 9 | `PUT /api/config/departments/:id` | 5478 |
| 10 | `PUT /api/settings/attendance-threshold` | 7555 |
| 11 | `PUT /api/holidays/:id` | 8302 |
| 12 | `PUT /api/classrooms/:id` | 8397 |
| 13 | `PUT /api/attendance/manage/:recordId` | 9252 |
| 14 | `PUT /api/attendance/manage/bulk` | 9288 |

---

## DELETE Endpoints (10)

| # | Endpoint | Line |
|---|----------|------|
| 1 | `DELETE /api/subjects/:subjectCode` | 1212 |
| 2 | `DELETE /api/students/:id` | 6603 |
| 3 | `DELETE /api/teachers/:id` | 6849 |
| 4 | `DELETE /api/enrollment/:enrollmentNo` | 6453 |
| 5 | `DELETE /api/config/branches/:identifier` | 5344 |
| 6 | `DELETE /api/config/departments/:identifier` | 5505 |
| 7 | `DELETE /api/config/semesters/:identifier` | 5397 |
| 8 | `DELETE /api/holidays/:id` | 8323 |
| 9 | `DELETE /api/classrooms/:id` | 8442 |
| 10 | `DELETE /api/attendance/manage/:recordId` | 8328 |

---

## API Groups

### Root & Health
- `GET /`
- `GET /api/health`
- `GET /api/time`

### Configuration
- `GET /api/config`
- `GET /api/config/branches`
- `GET /api/config/semesters`
- `GET /api/config/departments`
- `GET /api/config/academic-year`
- `GET /api/config/app`
- `POST /api/config/branches`
- `POST /api/config/semesters`
- `POST /api/config/departments`
- `PUT /api/config/branches/:id`
- `PUT /api/config/departments/:id`
- `DELETE /api/config/branches/:identifier`
- `DELETE /api/config/departments/:identifier`
- `DELETE /api/config/semesters/:identifier`

### Authentication
- `POST /api/login`

### Student Management
- `GET /api/students`
- `GET /api/students/:studentId/face-data`
- `POST /api/students`
- `POST /api/students/bulk`
- `PUT /api/students/:id`
- `DELETE /api/students/:id`

### Student Profile
- `GET /api/student-management`
- `GET /api/student/validate`
- `GET /api/view-records/students`
- `POST /api/refresh-profile`

### Teacher Management
- `GET /api/teachers`
- `POST /api/teachers`
- `POST /api/teachers/bulk`
- `PUT /api/teachers/:id`
- `PUT /api/teachers/:id/timetable-access`
- `DELETE /api/teachers/:id`

### Timetable
- `GET /api/timetables`
- `GET /api/timetable/:semester/*`
- `GET /api/timetable/:semester/:branch`
- `GET /api/timetable/current-period`
- `POST /api/timetable`
- `PUT /api/timetable/:semester/:branch`

### Periods
- `GET /api/periods`
- `POST /api/periods/update-all`

### Subjects
- `GET /api/subjects`
- `GET /api/subjects/:subjectCode`
- `GET /api/subjects/grouped/by-semester-branch`
- `POST /api/subjects`
- `PUT /api/subjects/:subjectCode`
- `PUT /api/subjects/bulk-update`
- `DELETE /api/subjects/:subjectCode`

### Teacher Related
- `GET /api/teacher/current-lecture/:teacherId`
- `GET /api/teacher/allowed-branches/:teacherId`
- `GET /api/teacher/current-class-students/:teacherId`
- `GET /api/teacher-schedule/:teacherId/:day`

### Attendance (General)
- `GET /api/attendance/stats`
- `GET /api/attendance/date/:date`
- `GET /api/attendance/date/:date/subject/:subject`
- `GET /api/attendance/period-report`
- `GET /api/attendance/daily-report`
- `GET /api/attendance/monthly-report`
- `GET /api/attendance/export`
- `GET /api/attendance/audit-trail`
- `GET /api/attendance/records`
- `GET /api/attendance/date-range`
- `GET /api/attendance/summary/:enrollmentNo`

### Attendance (Student Detail)
- `GET /api/attendance/student/:enrollmentNo/dates`
- `GET /api/attendance/student/:enrollmentNo/date/:date`
- `GET /api/attendance/student/:enrollmentNo/date/:date/lecture/:period`
- `GET /api/attendance/student/:enrollmentNo/subject-stats`

### Attendance (Teacher View)
- `GET /api/attendance/subjects`
- `GET /api/attendance/subject-dates`
- `GET /api/attendance/teacher/:teacherId/lectures`

### Attendance (Actions)
- `POST /api/attendance/check-in`
- `POST /api/attendance/record`
- `POST /api/attendance/offline-sync`
- `POST /api/attendance/period-sync`
- `POST /api/attendance/random-ring-response`
- `POST /api/attendance/manual-mark`
- `POST /api/attendance/start-session`
- `POST /api/attendance/lecture-start`
- `POST /api/attendance/lecture-end`
- `POST /api/attendance/add-verification`

### Attendance (History)
- `GET /api/attendance/history/:enrollmentNo`
- `POST /api/attendance/history/period`

### WiFi Verification
- `POST /api/attendance/wifi-event`
- `POST /api/attendance/validate-bssid`
- `GET /api/attendance/authorized-bssid/:studentId`
- `GET /api/daily-bssid-schedule`

### Timetable History
- `GET /api/timetable-history/day`
- `POST /api/timetable-history/backfill`

### Face Enrollment
- `GET /api/enrollments`
- `GET /api/enrollment/:enrollmentNo`
- `POST /api/enrollment`
- `POST /api/enrollment/verify`
- `PUT /api/enrollment/:enrollmentNo`
- `DELETE /api/enrollment/:enrollmentNo`

### Face Verification
- `POST /api/verify-face`
- `POST /api/verify-face-proof`
- `GET /api/face-descriptor/:userId`

### Settings
- `GET /api/settings`
- `GET /api/settings/attendance-threshold`
- `POST /api/settings/attendance-threshold`
- `PUT /api/settings/attendance-threshold`

### Holidays
- `GET /api/holidays`
- `GET /api/holidays/range`
- `POST /api/holidays`
- `PUT /api/holidays/:id`
- `DELETE /api/holidays/:id`

### Classrooms
- `GET /api/classrooms`
- `POST /api/classrooms`
- `PUT /api/classrooms/:id`
- `DELETE /api/classrooms/:id`

### Random Ring
- `POST /api/random-ring`
- `POST /api/random-ring/verify`
- `POST /api/random-ring/verify-direct`
- `POST /api/random-ring/verify-after-rejection`
- `POST /api/random-ring/teacher-action`
- `GET /api/random-ring/history/:teacherId`

### Database Management
- `POST /api/db/migrate`
- `POST /api/db/resync-attendance`
- `POST /api/db/wipe-all`

### Attendance Management
- `GET /api/attendance/manage`
- `POST /api/attendance/manage`
- `POST /api/attendance/manage/bulk-operation`
- `PUT /api/attendance/manage/:recordId`
- `PUT /api/attendance/manage/bulk`
- `DELETE /api/attendance/manage/:recordId`

### Daily Attendance Calculation
- `POST /api/attendance/calculate-daily`

### Departments
- `GET /api/departments`

### Photo Upload
- `GET /api/photo/:filename`
- `POST /api/upload-photo`

### All Attendance
- `GET /api/attendance/all`

---

*Generated from server.js (9601 lines)*
*Last updated: May 2026*
