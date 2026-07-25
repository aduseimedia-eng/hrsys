CREATE TABLE IF NOT EXISTS team_messages (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  sender_id    INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_messages_company_sent_idx
  ON team_messages (company_id, sent_at);
