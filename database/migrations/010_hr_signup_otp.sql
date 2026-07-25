CREATE TABLE IF NOT EXISTS hr_signup_otps (
  id            VARCHAR(64) PRIMARY KEY,
  company_name  VARCHAR(120) NOT NULL,
  full_name     VARCHAR(160) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_signup_otps_phone_created_idx
  ON hr_signup_otps (phone, created_at DESC);
