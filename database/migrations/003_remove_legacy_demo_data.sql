-- Remove records created by older KenadHR/HRConnect sample-data installations.
-- Real companies use their own slug and are not affected.

DELETE FROM companies
WHERE slug IN ('hrconnect-demo', 'kenad-hr-demo');
