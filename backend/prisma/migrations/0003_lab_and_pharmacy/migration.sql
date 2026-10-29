-- Additive migration: lab orders and pharmacy inventory (demo data only).
-- No existing patient, appointment, consultation, room or leave rows are changed.
CREATE TABLE `lab_orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `appointmentId` BIGINT NOT NULL,
  `patientId` BIGINT NOT NULL,
  `doctorId` VARCHAR(40) NOT NULL,
  `test` VARCHAR(190) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Назначено',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `lab_orders_appointmentId_test_key` (`appointmentId`, `test`),
  INDEX `lab_orders_doctorId_createdAt_idx` (`doctorId`, `createdAt`),
  INDEX `lab_orders_patientId_createdAt_idx` (`patientId`, `createdAt`),
  INDEX `lab_orders_status_createdAt_idx` (`status`, `createdAt`),
  CONSTRAINT `lab_orders_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lab_orders_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lab_orders_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pharmacy_items` (
  `id` VARCHAR(40) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `expire` DATE NULL,
  `manufacture` DATE NULL,
  `price` INTEGER NOT NULL DEFAULT 0,
  `qty` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `pharmacy_items_active_name_idx` (`active`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pharmacy_issues` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `itemId` VARCHAR(40) NOT NULL,
  `doctorId` VARCHAR(40) NOT NULL,
  `qty` INTEGER NOT NULL,
  `reason` VARCHAR(300) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `pharmacy_issues_doctorId_createdAt_idx` (`doctorId`, `createdAt`),
  INDEX `pharmacy_issues_itemId_createdAt_idx` (`itemId`, `createdAt`),
  CONSTRAINT `pharmacy_issues_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `pharmacy_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `pharmacy_issues_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Explicit fictional stock for portfolio demo; it is NOT real inventory.
INSERT INTO `pharmacy_items`
  (`id`, `name`, `expire`, `manufacture`, `price`, `qty`, `updatedAt`)
VALUES
('ph-1','Парацетамол 500мг табл.','2027-05-01','2025-05-01',45,120,CURRENT_TIMESTAMP(3)),
('ph-2','Амоксициллин 500мг капс.','2026-11-20','2024-11-20',180,0,CURRENT_TIMESTAMP(3)),
('ph-3','Ибупрофен 400мг табл.','2027-02-15','2025-02-15',60,85,CURRENT_TIMESTAMP(3)),
('ph-4','Лозартан 50мг табл.','2026-12-01','2024-12-01',210,0,CURRENT_TIMESTAMP(3)),
('ph-5','Метформин 850мг табл.','2027-06-10','2025-06-10',150,60,CURRENT_TIMESTAMP(3)),
('ph-6','Аторвастатин 20мг табл.','2026-11-30','2024-11-30',240,5,CURRENT_TIMESTAMP(3)),
('ph-7','Инсулин Гларгин, картридж','2026-11-05','2025-01-05',980,0,CURRENT_TIMESTAMP(3)),
('ph-8','Омепразол 20мг капс.','2027-08-01','2025-08-01',70,200,CURRENT_TIMESTAMP(3)),
('ph-9','Бисопролол 5мг табл.','2026-12-20','2024-12-20',90,3,CURRENT_TIMESTAMP(3)),
('ph-10','Физраствор NaCl 0.9%, 500мл','2028-01-01','2025-01-01',55,300,CURRENT_TIMESTAMP(3));
