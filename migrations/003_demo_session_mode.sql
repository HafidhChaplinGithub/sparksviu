ALTER TABLE sessions ADD COLUMN auth_mode text NOT NULL DEFAULT 'standard'
  CHECK (auth_mode IN ('standard','uat_password'));
