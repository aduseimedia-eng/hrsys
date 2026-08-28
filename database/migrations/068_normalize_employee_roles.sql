-- Access role and employment type are independent fields. Older data may have
-- stored an employment type such as "staff" in the access-role column.
UPDATE employees
SET role = 'employee'
WHERE role IS NULL OR role NOT IN ('admin', 'manager', 'employee');
