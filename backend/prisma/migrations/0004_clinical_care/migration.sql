-- Additive migration: structured prescribed medications per consultation.
-- Existing consultations, appointments and lab orders are not modified.
CREATE TABLE `prescriptions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `consultationId` BIGINT NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `dosage` VARCHAR(120) NOT NULL,
  `frequency` VARCHAR(120) NULL,
  `duration` VARCHAR(120) NULL,
  `instructions` VARCHAR(500) NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `prescriptions_consultationId_position_idx` (`consultationId`, `position`),
  PRIMARY KEY (`id`),
  CONSTRAINT `prescriptions_consultationId_fkey` FOREIGN KEY (`consultationId`) REFERENCES `consultations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
