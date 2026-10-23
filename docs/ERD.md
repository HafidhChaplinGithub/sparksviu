# ERD implementasi Sparksviu

Diagram diturunkan dari `migrations/001_core.sql` dan dibagi per domain agar bisa dibaca. Skema fisik ini memadatkan beberapa entitas konseptual pada ERD PRD: fase film menjadi atribut, varian tarif/tier menjadi JSONB tervalidasi, role menjadi enum aplikasi, budget reservation menyatu dengan participation, dan snapshot tujuan menyatu dengan payout. Tidak ada tabel fiktif untuk fitur yang belum dibangun.

## Identity

```mermaid
erDiagram
    direction LR
    users["users"] {
        uuid id PK
        text email UK
        text name
        text password_hash
        text role
        timestamptz email_verified_at
        timestamptz disabled_at
        text totp_secret
    }
    sessions["sessions"] {
        text id_hash PK
        uuid user_id FK
        timestamptz expires_at
        timestamptz created_at
    }
    authTokens["auth_tokens"] {
        text id_hash PK
        uuid user_id FK
        text kind
        timestamptz expires_at
    }
    rateLimits["rate_limits"] {
        text key PK
        integer count
        timestamptz expires_at
    }
    socialAccounts["social_accounts"] {
        uuid id PK
        uuid user_id FK
        text platform
        text handle
    }
    paymentDestinations["payment_destinations"] {
        uuid id PK
        uuid user_id FK
        text bank_code
        text account_cipher
        text account_last4
        text holder
        text status
        timestamptz verified_at
    }
    users ||--o{ sessions : "user_id"
    users ||--o{ authTokens : "user_id"
    users ||--o{ socialAccounts : "user_id"
    users ||--o{ paymentDestinations : "user_id"
```

## Campaign

```mermaid
erDiagram
    direction LR
    users["users"] {
        uuid id PK
        text email UK
        text name
        text password_hash
        text role
        timestamptz email_verified_at
        timestamptz disabled_at
        text totp_secret
    }
    films["films"] {
        uuid id PK
        text title
        text studio
        text genre
        date release_date
    }
    campaigns["campaigns"] {
        uuid id PK
        uuid film_id FK
        text slug UK
        uuid created_by FK
        text title
        text brief
        text phase
        text platforms
        text status
        integer quota
    }
    campaignRules["campaign_rules"] {
        uuid id PK
        uuid campaign_id FK
        integer version
        jsonb config
        timestamptz created_at
    }
    campaignAssets["campaign_assets"] {
        uuid id PK
        uuid campaign_id FK
        text storage_key UK
        integer version
        text name
        text mime
        integer size
        timestamptz embargo_at
        text rights_note
    }
    participations["participations"] {
        uuid id PK
        uuid campaign_id FK
        uuid user_id FK
        uuid rule_id FK
        text platform
        text status
        bigint reserve_amount
        timestamptz expires_at
        timestamptz created_at
    }
    submissions["submissions"] {
        uuid id PK
        uuid participation_id FK, UK
        uuid user_id FK
        uuid campaign_id FK
        text post_key UK
        text platform
        text url
        text status
        timestamptz created_at
    }
    submissionRevisions["submission_revisions"] {
        uuid id PK
        uuid submission_id FK
        text url
        text note
        timestamptz created_at
    }
    evidenceFiles["evidence_files"] {
        uuid id PK
        uuid submission_id FK
        uuid user_id FK
        text storage_key UK
        text name
        text mime
        integer size
        timestamptz created_at
    }
    reviewDecisions["review_decisions"] {
        uuid id PK
        uuid submission_id FK
        uuid reviewer_id FK
        text decision
        text reason
        timestamptz created_at
    }
    films ||--o{ campaigns : "film_id"
    users ||--o{ campaigns : "created_by"
    campaigns ||--o{ campaignRules : "campaign_id"
    campaigns ||--o{ campaignAssets : "campaign_id"
    campaigns ||--o{ participations : "campaign_id"
    users ||--o{ participations : "user_id"
    campaignRules ||--o{ participations : "rule_id"
    participations ||--o| submissions : "participation_id"
    users ||--o{ submissions : "user_id"
    campaigns ||--o{ submissions : "campaign_id"
    submissions ||--o{ submissionRevisions : "submission_id"
    submissions ||--o{ evidenceFiles : "submission_id"
    users ||--o{ evidenceFiles : "user_id"
    submissions ||--o{ reviewDecisions : "submission_id"
    users ||--o{ reviewDecisions : "reviewer_id"
    campaignRules o|..o{ campaigns : "current_rule_id"
```

## Reward

```mermaid
erDiagram
    direction LR
    users["users"] {
        uuid id PK
        text email UK
        text name
        text password_hash
        text role
        timestamptz email_verified_at
        timestamptz disabled_at
        text totp_secret
    }
    participations["participations"] {
        uuid id PK
        uuid campaign_id FK
        uuid user_id FK
        uuid rule_id FK
        text platform
        text status
        bigint reserve_amount
        timestamptz expires_at
        timestamptz created_at
    }
    submissions["submissions"] {
        uuid id PK
        uuid participation_id FK, UK
        uuid user_id FK
        uuid campaign_id FK
        text post_key UK
        text platform
        text url
        text status
        timestamptz created_at
    }
    viewSnapshots["view_snapshots"] {
        uuid id PK
        uuid submission_id FK
        uuid reported_by FK
        uuid evidence_id FK
        uuid accepted_by FK
        bigint views
        timestamptz captured_at
        text status
        text reason
        timestamptz created_at
    }
    assessments["assessments"] {
        uuid id PK
        uuid submission_id FK
        uuid snapshot_id FK
        uuid reviewer_id FK
        bigint accepted_views
        bigint amount
        text status
        timestamptz objection_until
        text reason
        timestamptz created_at
    }
    disputes["disputes"] {
        uuid id PK
        uuid assessment_id FK, UK
        uuid user_id FK
        uuid resolved_by FK
        text reason
        text status
        text resolution
        timestamptz created_at
    }
    settlements["settlements"] {
        uuid id PK
        uuid submission_id FK, UK
        uuid assessment_id FK, UK
        uuid user_id FK
        bigint amount
        timestamptz release_at
        timestamptz released_at
        timestamptz created_at
    }
    wallets["wallets"] {
        uuid user_id PK, FK
        bigint pending
        bigint available
        bigint held
        bigint paid
    }
    journalEntries["journal_entries"] {
        uuid id PK
        text event_key UK
        uuid user_id FK
        text kind
        uuid reference_id
        timestamptz created_at
    }
    journalLines["journal_lines"] {
        uuid id PK
        uuid entry_id FK
        text bucket
        bigint delta
    }
    users ||--o{ participations : "user_id"
    participations ||--o| submissions : "participation_id"
    users ||--o{ submissions : "user_id"
    submissions ||--o{ viewSnapshots : "submission_id"
    users ||--o{ viewSnapshots : "reported_by"
    users o|..o{ viewSnapshots : "accepted_by"
    submissions ||--o{ assessments : "submission_id"
    viewSnapshots o|..o{ assessments : "snapshot_id"
    users ||--o{ assessments : "reviewer_id"
    assessments ||--o| disputes : "assessment_id"
    users ||--o{ disputes : "user_id"
    users o|..o{ disputes : "resolved_by"
    submissions ||--o| settlements : "submission_id"
    assessments ||--o| settlements : "assessment_id"
    users ||--o{ settlements : "user_id"
    users ||--o| wallets : "user_id"
    users ||--o{ journalEntries : "user_id"
    journalEntries ||--o{ journalLines : "entry_id"
```

## Payout

```mermaid
erDiagram
    direction LR
    users["users"] {
        uuid id PK
        text email UK
        text name
        text password_hash
        text role
        timestamptz email_verified_at
        timestamptz disabled_at
        text totp_secret
    }
    paymentDestinations["payment_destinations"] {
        uuid id PK
        uuid user_id FK
        text bank_code
        text account_cipher
        text account_last4
        text holder
        text status
        timestamptz verified_at
    }
    wallets["wallets"] {
        uuid user_id PK, FK
        bigint pending
        bigint available
        bigint held
        bigint paid
    }
    payoutRequests["payout_requests"] {
        uuid id PK
        uuid user_id FK
        uuid destination_id FK
        text request_key UK
        text provider_id UK
        text provider_key UK
        jsonb destination_snapshot
        bigint amount
        text status
        text failure_reason
        timestamptz created_at
        timestamptz updated_at
    }
    payoutBatches["payout_batches"] {
        uuid id PK
        uuid approved_by FK
        timestamptz created_at
    }
    payoutBatchItems["payout_batch_items"] {
        uuid payout_id PK, FK
        uuid batch_id FK
    }
    payoutAttempts["payout_attempts"] {
        uuid id PK
        uuid payout_id FK
        text status
        integer http_status
        text note
        timestamptz created_at
    }
    webhookInbox["webhook_inbox"] {
        uuid id PK
        text fingerprint UK
        text provider_id
        jsonb payload
        text status
        timestamptz created_at
    }
    reconciliationCases["reconciliation_cases"] {
        uuid id PK
        uuid payout_id FK
        text provider_id
        text reason
        timestamptz resolved_at
        timestamptz created_at
    }
    outbox["outbox"] {
        uuid id PK
        text event_key UK
        text kind
        jsonb payload
        text status
        integer attempts
        timestamptz available_at
        timestamptz claimed_at
    }
    users ||--o{ paymentDestinations : "user_id"
    users ||--o| wallets : "user_id"
    users ||--o{ payoutRequests : "user_id"
    paymentDestinations ||--o{ payoutRequests : "destination_id"
    users ||--o{ payoutBatches : "approved_by"
    payoutRequests ||--o| payoutBatchItems : "payout_id"
    payoutBatches ||--o{ payoutBatchItems : "batch_id"
    payoutRequests ||--o{ payoutAttempts : "payout_id"
    payoutRequests o|..o{ reconciliationCases : "payout_id"
```

## Operations

```mermaid
erDiagram
    direction LR
    users["users"] {
        uuid id PK
        text email UK
        text name
        text password_hash
        text role
        timestamptz email_verified_at
        timestamptz disabled_at
        text totp_secret
    }
    notifications["notifications"] {
        uuid id PK
        uuid user_id FK
        text title
        text message
        timestamptz read_at
        timestamptz created_at
    }
    auditEvents["audit_events"] {
        uuid id PK
        uuid actor_id FK
        text action
        uuid object_id
        jsonb detail
        timestamptz created_at
    }
    outbox["outbox"] {
        uuid id PK
        text event_key UK
        text kind
        jsonb payload
        text status
        integer attempts
        timestamptz available_at
        timestamptz claimed_at
    }
    users ||--o{ notifications : "user_id"
    users o|..o{ auditEvents : "actor_id"
```

## Invarian di luar gambar

- Partial unique index: satu assessment aktif per posting dan satu pencairan aktif per pengguna.
- Satu settlement per posting/assessment, satu post_key global, provider ID dan idempotency key unik.
- Wallet nonnegatif, reserved + spent <= budget.
- Tiap jurnal harus seimbang; mutasi saldo dan jurnal terjadi dalam transaksi yang sama.
- Relasi FK diagram tidak menggantikan pemeriksaan ownership dan peran pada layanan.
- `schema_migrations` dikelola runner migrasi dan tidak termasuk domain produk.
