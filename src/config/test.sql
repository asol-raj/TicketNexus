
select * FROM clients;

SELECT * FROM tickets;

select * from users;
select * from employees order by id desc;

SELECT t.* FROM tickets t
      WHERE t.assigned_to IS NULL AND t.status NOT IN ('closed','resolved')
   ORDER BY t.created_at DESC LIMIT 20;

SELECT e.id AS `manager_employee_id`,
        COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS label
      FROM `employees` e
      JOIN `users` u ON u.id = e.user_id
      WHERE u.client_id=1 AND u.role='manager' AND e.employment_type='internal'
      ORDER BY label ASC;


SELECT id, subject, status, assigned_to FROM tickets WHERE assigned_to IS NOT NULL;
SELECT id, user_id, first_name, last_name FROM employees;

SELECT * FROM tickets;


SELECT e.id AS employee_id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE ux.client_id=1 AND ux.role='manager' AND e.employment_type = 'internal';

SELECT * FROM employees WHERE position = 'employee' and employment_type = 'internal';

SELECT e.id AS employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS label
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id = 1 AND employment_type = 'internal'
        ORDER BY label ASC;

SELECT * FROM employees WHERE employment_type = 'internal';

SELECT * FROM users;

SELECT COUNT(*) AS total_employees
         FROM employees e JOIN users u on u.id = e.user_id
        WHERE u.client_id=1 AND e.employment_type = 'internal';

INSERT INTO employees (user_id, first_name, last_name, position)
VALUES(2, 'Raj Shekhar', 'Singh', 'Admin');

UPDATE employees SET position = 'Admin' WHERE id = 14;


SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id = 1
        ORDER BY t.id DESC;

SELECT * FROM tickets order by id desc;

SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id = 1 AND t.status NOT IN ('discarded', 'archived')
        ORDER BY t.id DESC
        LIMIT 50;


select * FROM users order by id DESC;
UPDATE users SET role = 'manager' WHERE id = 16;

SELECT * FROM employees ORDER BY id DESC;
UPDATE employees SET manager_id = NULL WHERE id = 15;
UPDATE employees SET position = 'Manager' WHERE id = 15;