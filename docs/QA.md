# Verifikasi implementasi

Tanggal: 23 Oktober 2026. Seluruh data pengujian sintetis; tidak ada transfer uang nyata, email pengguna nyata, atau probing produksi.

| Pemeriksaan                   | Hasil                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Build Next.js produksi        | Berhasil, TypeScript termasuk di dalam build                                                                               |
| Runtime standalone            | Berhasil dijalankan dengan PostgreSQL 17 terisolasi                                                                        |
| Domain + integrasi PostgreSQL | 16 kasus lolos                                                                                                             |
| Browser desktop/ponsel/gelap  | 56 langkah lolos, tanpa error JavaScript atau request eksternal                                                            |
| Validasi Docker Compose       | Berhasil, dengan environment contoh dan tanpa menjalankan layanan produksi                                                 |
| Advisory dependensi produksi  | `npm audit` dan `npm audit --omit=dev`: 0 advisory pada saat pemeriksaan                                                   |
| Audit keamanan sumber         | Profil standard, seluruh source aplikasi, 11 unit cakupan; kandidat historis diperbaiki dan dibaca ulang secara independen |

## Perilaku yang diuji

- CPM minimum/cap/pembulatan, tier tertinggi, fixed, URL posting dan primitive kriptografi.
- Perebutan slot bersamaan, kepemilikan submission, penilaian tanpa kredit saldo prematur, keberatan dan satu kali settlement/release.
- Rekening 24 jam, saldo hold, request idempotent, callback ganda/bertentangan, ID provider 19 digit, nominal/tujuan tidak cocok dan pengembalian dana final.
- Password reset yang berbarengan login; konfirmasi MFA dan pencabutan sesi; keberatan yang commit saat settlement menunggu kunci.
- Request Flip dimock: form nominal/tujuan, stable idempotency header, query `idempotency-key` untuk rekonsiliasi, dispatch berulang dan CANCELLED berulang. Tidak menghubungi provider.
- Browser: filter, keyboard skip link, login, profil, slot, posting, file bukti, TOTP staf, review, views, penilaian, keberatan, rekening, hold/cancel payout, penolakan batch saat Flip disabled, akses staf/ekspor/CSRF, pembuatan/publikasi kampanye, versi tarif, materi privat, revisi/penolakan dan pencabutan akses materi.

Fixture browser sengaja mempercepat deadline/umur rekening dan mengisi saldo contoh langsung untuk memeriksa layar/alur. Pembuktian settlement dan jurnal memakai tes transaksi terpisah; screenshot saldo demo bukan bukti uang atau keberhasilan transfer.

## Isolasi lokal

Pengujian dijalankan dalam container: tanpa jaringan luar, hanya loopback PostgreSQL disposable, environment allowlist kosong dari kredensial host, sumber/toolchain asli hanya-baca, writable scratch, batas CPU/memori/proses/ukuran file/disk/waktu. Browser memakai disk scratch 256 MB terpisah dan artefak gambar dipromosikan dengan pemeriksaan regular file/no-follow/ukuran. Laporan audit rinci dan bukti tetap di luar repository.

Toolchain uji berada pada path terpisah, sehingga build lokal memberi peringatan tracing dependency di luar root. Runtime standalone tetap diverifikasi dengan dependency lengkap. Dockerfile produksi memasang dependency langsung di `/app/node_modules` dan menyalinnya ke runtime; build image dan konfigurasi Dokploy pada server pemilik tetap perlu diverifikasi saat deployment.

## Belum diverifikasi di lingkungan pemilik

- Deployment/image server Dokploy, proxy/TLS/domain dan resource aktual.
- SMTP, SPF/DKIM/DMARC serta pengiriman verifikasi/reset ke mailbox nyata.
- UAT akun Flip Bisnis sandbox milik pemilik, callback publik, fee/deposit dan aktivasi live.
- Backup/restore DB, upload dan kunci enkripsi pada server tujuan.
- Uji beban terhadap kapasitas peluncuran dan retensi file jangka panjang.
- Persetujuan kebijakan final dan identitas pengendali data.

Keberhasilan pengujian lokal dan audit sumber tidak menyatakan lingkungan produksi sudah lulus. Pendaftaran dan Flip tetap disabled secara default sampai release gates diselesaikan.
