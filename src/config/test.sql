
select * FROM clients;

SELECT * FROM tickets;

select * from users;
select * from employees order by id desc;

SELECT t.* FROM tickets t
      WHERE t.assigned_to IS NULL AND t.status NOT IN ('closed','resolved')
   ORDER BY t.created_at DESC LIMIT 20;


SELECT id, subject, status, assigned_to FROM tickets WHERE assigned_to IS NOT NULL;
SELECT id, user_id, first_name, last_name FROM employees;
