-- Вес тела с привязкой к дате (effective load, гравитрон и т.д.).

CREATE TABLE IF NOT EXISTS biometrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_kg NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biometrics_created_at ON biometrics(created_at DESC);

ALTER TABLE biometrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "biometrics allow anon read" ON biometrics;
CREATE POLICY "biometrics allow anon read" ON biometrics FOR SELECT USING (true);
DROP POLICY IF EXISTS "biometrics allow anon insert" ON biometrics;
CREATE POLICY "biometrics allow anon insert" ON biometrics FOR INSERT WITH CHECK (true);
