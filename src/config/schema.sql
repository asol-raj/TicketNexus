-- Active: 1755672853063@@127.0.0.1@3306@ticketnexus

CREATE DATABASE `ticketnexus` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'user_ticketnexus'@'%' IDENTIFIED BY 'J4s5CrejLmaMaCU2';

GRANT ALL PRIVILEGES ON `ticketnexus`.* TO 'user_ticketnexus'@'%';
FLUSH PRIVILEGES;

-- =========================================
-- CLIENTS (your customers using the app)
CREATE TABLE `clients` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `contact_email` VARCHAR(150),
    `contact_phone` VARCHAR(20),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- USERS (both your team + client team + super admin)
CREATE TABLE `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `client_id` INT NULL,  -- NULL for super admin, else belongs to client
    `manager_id` INT NULL,
    `username` VARCHAR(100) NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('super_admin','admin','manager','employee') NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
-- ALTER TABLE tasknexus.`users` MODIFY `username` VARCHAR(100) NULL UNIQUE;

INSERT INTO `users` 
(`username`, `password_hash`, `role`, `email`) 
VALUES('super', '$2a$10$tbcxXAbLFbLhdRh8oMZ3me5SKdDdZHCZfM2GsVdOIKxWYHL88sjx.', 'super_admin', 'rshekhar21@gmail.com');

SELECT * FROM users;
-- =========================================
-- EMPLOYEES (extra profile info)
CREATE TABLE `employees` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `first_name` VARCHAR(100),
    `last_name` VARCHAR(100),
    `position` VARCHAR(100),
    `manager_id` INT NULL,
    `date_of_joining` DATE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL
);

-- =========================================
-- SHIFTS (work schedule)
CREATE TABLE `shifts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `employee_id` INT NOT NULL,
    `shift_start` TIME NOT NULL,
    `shift_end` TIME NOT NULL,
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

-- =========================================
-- ATTENDANCE (daily clock in/out)
CREATE TABLE `attendance` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `employee_id` INT NOT NULL,
    `date` DATE NOT NULL,
    `clock_in` DATETIME,
    `clock_out` DATETIME,
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
);

-- =========================================
-- SLA POLICIES
CREATE TABLE `sla_policies` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `priority` ENUM('low','medium','high','urgent') NOT NULL,
    `response_time_hours` INT NOT NULL,
    `resolution_time_hours` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- TICKETS (clients raise support tickets to your team)
CREATE TABLE `tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `client_id` INT NOT NULL,
    `raised_by` INT NOT NULL, -- user_id of client employee
    `assigned_to` INT NULL,   -- your team employee_id, can be NULL initially
    `subject` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `priority` ENUM('low','medium','high','urgent') DEFAULT 'medium',
    `status` ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
    `sla_policy_id` INT NULL,
    `due_at` DATETIME NULL,
    `resolved_at` DATETIME NULL,
    `sla_status` ENUM('within_sla','breached') DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`),
    FOREIGN KEY (`raised_by`) REFERENCES `users`(`id`),
    FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`id`),
    FOREIGN KEY (`sla_policy_id`) REFERENCES `sla_policies`(`id`)
);

-- =========================================
-- TICKET ATTACHMENTS (images, files)
CREATE TABLE `ticket_attachments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE
);

-- =========================================
-- TASKS (internal task mgmt for both client teams & your team)
CREATE TABLE `tasks` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `assigned_by` INT NOT NULL,   -- user_id of manager
    `assigned_to` INT NOT NULL,   -- employee_id
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `status` ENUM('pending','in_progress','completed') DEFAULT 'pending',
    `due_date` DATE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`),
    FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`id`)
);

-- =========================================
-- TASK ATTACHMENTS
CREATE TABLE `task_attachments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `task_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);

-- =========================================
-- COMMENTS (for tickets or tasks)
CREATE TABLE `comments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `task_id` INT NULL,
    `ticket_id` INT NULL,
    `user_id` INT NOT NULL,
    `comment` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

-- =========================================
-- FEEDBACK (client rates resolved tickets)
CREATE TABLE `feedback` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT NOT NULL UNIQUE,
    `client_id` INT NOT NULL,
    `rating` INT CHECK (`rating` BETWEEN 1 AND 5),
    `liked` BOOLEAN,
    `disliked` BOOLEAN,
    `comment` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
);

SHOW TABLES;