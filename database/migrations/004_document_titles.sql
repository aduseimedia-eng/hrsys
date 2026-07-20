ALTER TABLE documents ADD COLUMN IF NOT EXISTS title VARCHAR(200);

UPDATE documents
SET title = COALESCE(NULLIF(regexp_replace(original_name, '\\.[^.]+$', ''), ''), original_name)
WHERE title IS NULL OR title = '';

ALTER TABLE documents ALTER COLUMN title SET NOT NULL;
