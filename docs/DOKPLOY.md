# Deploy Sparksviu ke Dokploy

Kode disiapkan untuk **Docker Compose biasa**, bukan Docker Stack/Swarm. Akun, domain, server dan kredensial produksi tetap milik operator. Langkah ini belum berarti deployment server sudah dilakukan.

## 1. Sumber dan konfigurasi

1. Buat Project dan service **Docker Compose** di Dokploy.
2. Hubungkan repository private `HafidhChaplinGithub/sparksviu`, branch `main`.
3. Build context root repository, Compose path `compose.yaml`.
4. Gunakan **Isolated Deployments** bila tersedia. Periksa Preview Compose: `web`, `worker`, `migrate`, dan `db` harus tetap saling terhubung; hanya `web` dihubungkan ke proxy publik.
5. Salin isi `.env.example` ke tab Environment. Dokploy menulis `.env`; Compose memakai `env_file` sehingga variabel benar-benar masuk container.

Nilai wajib:

| Variabel               | Pengaturan                                   |
| ---------------------- | -------------------------------------------- |
| `APP_URL`              | URL publik HTTPS, tanpa path tambahan        |
| `POSTGRES_PASSWORD`    | Password acak URL-safe; hex direkomendasikan |
| `ENCRYPTION_KEY`       | 32 byte base64, stabil sepanjang umur data   |
| `NODE_ENV`             | `production`                                 |
| `STORAGE_DIR`          | `/app/storage`                               |
| `FLIP_MODE`            | `disabled` sampai UAT sandbox selesai        |
| `REGISTRATION_ENABLED` | `false` sampai kebijakan dan email siap      |

Contoh membuat nilai acak **di lingkungan operator**:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Jangan commit hasilnya. `DATABASE_URL` untuk Compose ditetapkan dari `POSTGRES_PASSWORD` dan host internal `db`; variabel URL pada contoh environment dipakai untuk proses development/CLI di luar Compose. Password selain karakter URL-safe harus di-encode sebelum dimasukkan dalam URL.

**Jangan mengganti ENCRYPTION_KEY pada redeploy.** Tanpa kunci yang sama, rekening dan secret autentikator tidak bisa dibaca. Simpan cadangan kunci terpisah dari backup database dan batasi aksesnya.

## 2. Domain dan layanan

- Tambah domain pada tab Domains untuk service **`web`**, target port **3000**, HTTPS aktif.
- Jangan tambah domain atau host port untuk `db`, `worker`, atau `migrate`.
- Pastikan reverse proxy mengizinkan upload 20 MB per file beserta overhead, dengan timeout yang memadai.
- Deploy. `migrate` harus selesai dengan exit 0, lalu `web` dan `worker` berjalan. Jika migrasi gagal, berhenti dan periksa log; jangan menghapus volume untuk mengatasi error.
- Preflight web/worker menolak URL HTTP, kunci enkripsi kosong, dan konfigurasi registrasi/live Flip yang belum lengkap.

## 3. Administrator pertama

Di terminal container web yang benar, jalankan perintah berikut dengan nilai milik operator. Input password melalui prompt agar tidak tersimpan sebagai teks perintah shell:

```sh
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (min. 14 chars): ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
node node_modules/tsx/dist/cli.mjs scripts/admin.ts
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Masuk dengan akun itu, buka Profil, daftarkan secret ke aplikasi autentikator, lalu konfirmasi kode. Dashboard staf wajib TOTP. Buat akun staf lain melalui pendaftaran yang terkendali, kemudian berikan peran lewat Pengguna. Reviewer independen kedua dibutuhkan untuk menyelesaikan keberatan terhadap penilaian reviewer pertama.

Tidak ada akun/password demo otomatis pada produksi. `seed:demo` menolak `NODE_ENV=production`.

## 4. Email dan registrasi

Isi SMTP host, port, user, password, from, dan support email. Port 587 menggunakan STARTTLS wajib; 465 memakai TLS langsung. Uji email verifikasi/reset pada akun operator di staging, dan periksa SPF/DKIM/DMARC domain pengirim.

Lengkapi dokumen kebijakan final, identitas pengendali data, retensi, kontak, hak materi dan ketentuan keuangan. Baru setelah disetujui, set `POLICIES_APPROVED=true` dan `REGISTRATION_ENABLED=true`. Draf halaman kebijakan di aplikasi harus diganti dengan naskah yang disahkan sebelum peluncuran terbuka.

## 5. Flip Bisnis

1. Gunakan akun Flip Bisnis dan API key **sandbox**. Set `FLIP_MODE=sandbox`.
2. Isi `FLIP_API_KEY`, `FLIP_CALLBACK_TOKEN`, dan daftar bank yang benar-benar tersedia di akun.
3. Di dashboard Flip, atur callback ke `https://DOMAIN/api/flip/callback` dengan token akun yang sama.
4. Verifikasi manual kepemilikan rekening oleh finance, lalu tunggu 24 jam sebelum pencairan.
5. Uji satu transaksi sandbox: requested → approved → sending → pending → succeeded, beserta CANCELLED, timeout, callback ulang, callback sebelum respons create, dan rekonsiliasi.
6. Cocokkan nominal, ID provider, rekening dan jurnal. Konfirmasi biaya transfer dan saldo deposit akun Flip; biaya provider tidak mengurangi reward peserta secara diam-diam.
7. Mode live hanya setelah UAT disetujui operator, deposit/fee tersedia dan kredensial live benar. Jangan memakai transaksi nyata sebagai tes otomatis.

Worker mengikuti `PAYOUT_WEEKDAYS` (0 Minggu, 1 Senin sampai 6 Sabtu; default 1,2,3,4,5) dan `PAYOUT_HOUR_WIB` (default mulai 10 WIB). Pencairan yang disetujui setelah jam itu diproses pada tick berikutnya di hari yang diizinkan; ini bukan jadwal sekali sehari.

Dana hasil tidak pasti tetap held. Gunakan tombol Cek ke Flip. Jangan membuat transfer pengganti atau mengganti provider key untuk retry teknis. Callback awal yang tiba sebelum ID tersimpan dapat memerlukan rekonsiliasi finance.

## 6. Persistensi, backup dan rollback

- Volume `postgres`: data PostgreSQL. Volume `uploads`: materi dan bukti privat.
- Aktifkan backup terjadwal Dokploy untuk database dan named volume upload ke penyimpanan off-server dengan retensi yang ditetapkan operator.
- Gunakan backup PostgreSQL yang konsisten (`pg_dump`/fitur database backup), bukan menyalin berkas data aktif secara sembarang.
- Contoh ekspor database dari checkout dengan environment produksi yang benar:

```sh
docker compose exec -T db pg_dump -U sparksviu -d sparksviu -Fc > sparksviu-backup.dump
```

Simpan backup dengan izin ketat, enkripsi dan akses terbatas; perintah di atas tidak mengunggah backup ke lokasi lain. Backup upload dan kunci enkripsi juga diperlukan agar restore berguna.

Sebelum migrasi berikutnya: catat commit/image saat ini, verifikasi backup yang bisa dipulihkan, siapkan maintenance window bila perubahan skema tidak kompatibel. Migrasi hanya forward dan dijalankan oleh service `migrate` dengan advisory lock. Rollback kode tidak otomatis membatalkan skema. Jangan menjalankan `docker compose down -v` pada lingkungan yang berisi data.

Uji restore ke staging terpisah: pulihkan DB, upload, dan kunci yang sama; pastikan login, file privat, saldo/jurnal, dan koneksi worker benar sebelum menyebut backup berhasil.

## 7. Pemeriksaan setelah deploy

- Health `GET /api/health` berstatus ok; identitas commit/image sesuai yang dirilis.
- HTTPS, cookie Secure/HttpOnly/SameSite, domain dan exact APP_URL cocok.
- Restart/redeploy tidak menghilangkan pekerjaan, saldo, rekening atau file.
- Worker aktif, email terkirim, tidak ada antrean failed yang diabaikan.
- Akun kreator tidak dapat membuka data staff/finance atau file peserta lain.
- UAT sandbox Flip dan restore sudah ditandatangani operator.

Verifikasi lokal pada repository tidak membuktikan konfigurasi server tersebut sudah benar.

Referensi resmi: [Compose](https://docs.dokploy.com/docs/core/docker-compose), [Domains](https://docs.dokploy.com/docs/core/docker-compose/domains).
