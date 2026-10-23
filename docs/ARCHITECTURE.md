# Sparksviu — arsitektur implementasi

Stack: Next.js App Router, React, TypeScript, PostgreSQL 17, `pg`, Zod. Semua data operasional tersimpan di PostgreSQL. Materi dan bukti disimpan dalam volume privat; file tidak diletakkan pada `public/`.

## Keputusan implementasi

- **Satu aplikasi, worker terpisah.** Next menangani halaman dan API, worker menangani antrean email, pengiriman payout, kedaluwarsa slot, settlement, dan pelepasan saldo. PostgreSQL outbox dengan `FOR UPDATE SKIP LOCKED` menghindari keharusan Redis untuk peluncuran awal. Worker harus tetap berjalan; web saja tidak menyelesaikan reward atau payout.
- **SQL transaksional eksplisit.** Migrasi SQL dan query berparameter melalui `pg` dipilih agar penguncian budget, rekening, saldo, dan jurnal terlihat jelas. Perubahan skema berikutnya ditambah sebagai migrasi baru; jangan mengubah migrasi yang sudah diterapkan.
- **Versi tarif tersimpan.** Setiap slot mengikat satu `campaign_rules.id`; versi baru hanya berlaku untuk slot baru. CPM dihitung dengan integer, tier tidak kumulatif, fixed tanpa syarat views.
- **Buku besar dan saldo.** `wallets` adalah proyeksi untuk UI. `journal_entries` dan `journal_lines` mencatat perpindahan dana seimbang. Estimasi tidak dicatat sebagai dana tersedia. Satu settlement per posting dan satu pencairan aktif per pengguna dilindungi constraint database.
- **Autentikasi lokal.** Kata sandi scrypt, sesi opaque yang disimpan sebagai hash, verifikasi email/reset satu kali, TOTP wajib untuk staf. Login, pencabutan kredensial, dan aktivasi faktor memakai penguncian baris akun yang sama. Kunci enkripsi AES-GCM wajib stabil dan dibackup terpisah.
- **Pembayaran keluar melalui Flip Bisnis.** Ini alur disbursement reward, bukan checkout/top-up. Mode default `disabled`; sandbox dan live memakai kredensial terpisah. Dana transaksi yang hasilnya belum pasti tetap ditahan. Pengecekan dan pengiriman tidak boleh menggunakan identitas transaksi baru untuk retry teknis.
- **Bukti views P0 manual.** Sistem tidak mengambil angka views dari scraping atau API sosial. Reviewer memeriksa bukti dan waktu cutoff. Otomatisasi API sosial merupakan integrasi terpisah yang memerlukan izin akses platform.

## Batas produk yang perlu diketahui

Satu instalasi melayani satu operator Sparksviu. Ini bukan SaaS multi-tenant dengan login brand/klien terpisah. Brand portal, payout berdasarkan views otomatis, aplikasi native, dan general purpose wallet tidak termasuk implementasi ini.

Verifikasi rekening dilakukan finance dengan bukti kepemilikan yang diterima tim. API bank-account inquiry Flip belum diaktifkan. Semua akses nomor lengkap direkam pada audit. Jangan menyebut pemeriksaan manual sebagai validasi otomatis bank.

Dashboard menampilkan maksimal 100 kampanye publik, 100 pekerjaan peserta, 200 antrean staf, dan 10.000 baris ekspor payout. Snapshot dibatasi 100 per posting. Untuk volume melebihi cakupan peluncuran awal, tambahkan pagination server, indeks berbasis pola query, dan pengukuran beban sebelum meningkatkan kapasitas.

Kebijakan publik yang tersedia adalah draf operasional. Pemilik harus menetapkan identitas pengendali data, ketentuan hak materi, dukungan, retensi dan kewajiban perpajakan sebelum membuka registrasi. Nilai `POLICIES_APPROVED` bukan pengganti penyusunan dokumen final.

## Struktur

- `src/app`: halaman, handler HTTP, error states.
- `src/components/experience.tsx`: pengalaman Feed Kreator, formulir dan dashboard.
- `src/lib/auth.ts`: identitas, faktor, sesi dan enkripsi.
- `src/lib/campaigns.ts`: slot, posting, views, keberatan, settlement.
- `src/lib/payouts.ts`: hold, batch, adapter Flip, finalisasi dan rekonsiliasi.
- `src/lib/db.ts`: transaksi, jurnal, audit, notifikasi.
- `migrations`: skema PostgreSQL.
- `scripts`: bootstrap, migrasi, worker, preflight dan demo seed.
- `tests`: domain, transaksi PostgreSQL, regresi konkurensi dan browser.

## Referensi integrasi

Kontrak diverifikasi dari dokumentasi resmi pada 23 Oktober 2026:

- Next.js deployment: https://nextjs.org/docs/app/getting-started/deploying
- Dokploy Compose: https://docs.dokploy.com/docs/core/docker-compose
- Flip disbursement: https://docs.flip.id/docs/api/create-disbursement/
- Flip reconciliation: https://docs.flip.id/docs/api/get-disbursement/
- Flip idempotency: https://docs.flip.id/docs/idempotent-request/

ID Flip 19 digit diparse dengan `json-bigint` dan disimpan sebagai teks. Callback berupa form `token` dan `data` JSON, status akhir `DONE` atau `CANCELLED`. UAT pada akun sandbox pemilik tetap diperlukan sebelum mode live.
