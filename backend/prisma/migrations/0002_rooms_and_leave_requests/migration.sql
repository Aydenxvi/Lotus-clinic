-- Real clinic rooms + staff leave requests. Does not change existing appointments,
-- doctors, users or consultations.
CREATE TABLE `rooms` (
  `id` VARCHAR(80) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `departmentId` VARCHAR(40) NOT NULL,
  `doctorId` VARCHAR(40) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Свободен',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `rooms_doctorId_key` (`doctorId`),
  INDEX `rooms_departmentId_idx` (`departmentId`),
  CONSTRAINT `rooms_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rooms_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `doctors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `leave_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `doctorId` VARCHAR(40) NOT NULL,
  `date` DATE NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `leave_requests_doctorId_createdAt_idx` (`doctorId`,`createdAt`),
  INDEX `leave_requests_status_date_idx` (`status`,`date`),
  CONSTRAINT `leave_requests_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `doctors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stable room numbering, matching the existing front-end seed order (Russian
-- alphabetical department names). MySQL 8 supports ROW_NUMBER(). Existing
-- localStorage assignments are not imported because they are browser-local.
INSERT INTO `rooms` (`id`, `name`, `departmentId`, `status`, `updatedAt`)
SELECT CONCAT(x.id, '-', suffix.n),
       CONCAT('Каб. ', 101 + (x.pos - 1) * 2 + suffix.n - 1),
       x.id,
       CASE WHEN (suffix.n = 1 AND MOD(x.pos - 1, 3) = 0)
              OR (suffix.n = 2 AND MOD(x.pos - 1, 4) = 0)
            THEN 'Занят' ELSE 'Свободен' END,
       CURRENT_TIMESTAMP(3)
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) AS pos FROM `departments` WHERE active = true) AS x
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 AS n) AS suffix;
