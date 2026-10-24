ALTER TABLE users ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN access_expires_at timestamptz;
ALTER TABLE campaigns ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE payout_requests ADD COLUMN method text NOT NULL DEFAULT 'flip' CHECK(method IN ('manual','flip'));
ALTER TABLE payout_requests DROP CONSTRAINT payout_requests_status_check;
ALTER TABLE payout_requests ADD CONSTRAINT payout_requests_status_check CHECK(status IN ('requested','approved','sending','pending','succeeded','failed','cancelled','needs_review','manual_processing','manual_review'));
DROP INDEX payout_one_active;
CREATE UNIQUE INDEX payout_one_active ON payout_requests(user_id) WHERE status IN ('requested','approved','sending','pending','needs_review','manual_processing','manual_review');
CREATE TABLE manual_transfer_references(reference text PRIMARY KEY,payout_id uuid NOT NULL REFERENCES payout_requests(id));
CREATE TABLE manual_payout_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payout_id uuid NOT NULL REFERENCES payout_requests(id),
 reference text NOT NULL REFERENCES manual_transfer_references(reference), amount bigint NOT NULL CHECK(amount>0), paid_at timestamptz NOT NULL,
 recorded_by uuid NOT NULL REFERENCES users(id), reviewed_by uuid REFERENCES users(id),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','confirmed','rejected')),
 storage_key text NOT NULL UNIQUE, name text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 size integer NOT NULL CHECK(size>0 AND size<=5242880), note text NOT NULL, review_note text,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 CHECK(reviewed_by IS NULL OR reviewed_by<>recorded_by)
);
CREATE UNIQUE INDEX manual_proof_active ON manual_payout_proofs(payout_id) WHERE status IN ('submitted','confirmed');
