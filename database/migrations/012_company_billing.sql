CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id              INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  plan_key                VARCHAR(80) NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','expired','cancelled')),
  payment_reference       VARCHAR(140) UNIQUE,
  amount                  BIGINT NOT NULL CHECK (amount > 0),
  currency                VARCHAR(10) NOT NULL,
  paystack_customer_code  VARCHAR(100),
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id            BIGSERIAL PRIMARY KEY,
  company_id    INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference     VARCHAR(140) NOT NULL UNIQUE,
  plan_key      VARCHAR(80) NOT NULL,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  currency      VARCHAR(10) NOT NULL,
  status        VARCHAR(30) NOT NULL,
  paid_at       TIMESTAMPTZ,
  provider_data JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_payments_company ON billing_payments(company_id, created_at DESC);

CREATE TRIGGER trg_company_subscriptions_updated_at
  BEFORE UPDATE ON company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
