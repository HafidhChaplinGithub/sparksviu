# Alur operasional Sparksviu

## Menyiapkan kampanye

1. Ops membuat draf: film/studio, brief, platform, jumlah slot, budget, tenggat unggah, cutoff dan warna ilustrasi.
2. Pilih skema reward. CPM membayar seluruh views valid setelah minimum tercapai, dibulatkan ke bawah ke rupiah dan dibatasi cap. Tier membayar bonus tertinggi saja. Fixed membayar nominal tetap setelah posting disetujui dan pengukuran/finalisasi selesai.
3. Unggah materi dengan hak penggunaan dan embargo. Ini bukan izin untuk memakai semua materi film di luar kampanye.
4. Buka kampanye. Sistem menahan maksimum reward saat slot diambil. Jika budget atau kuota tidak cukup, slot ditolak secara transaksional.
5. Ubah tarif dengan versi baru. Slot lama tetap mengikat tarif sebelumnya. Simpan perubahan brief yang berpengaruh pada hak peserta melalui proses persetujuan operasional; antarmuka tidak menyediakan penggantian ketentuan historis secara diam-diam.

## Posting dan pengukuran

- Peserta memverifikasi email dan menambahkan akun sosial.
- Satu peserta mengambil satu slot per kampanye dan memilih platform. Upload tenggat sama dengan masa berlaku reservasi. Slot yang tidak dikirim kedaluwarsa dan membebaskan budget.
- Link posting asli wajib HTTPS TikTok/Instagram. Shortlink tidak diterima. ID posting unik secara global; revisi tetap memakai posting asli.
- Reviewer memeriksa kepemilikan, brief, hak materi dan disclosure, lalu menyetujui, meminta revisi atau menolak dengan alasan.
- Revisi submission yang sudah dikirim dapat diajukan sebelum cutoff. Materi/bukti file tidak dihapus melalui UI untuk mempertahankan jejak pemeriksaan.
- Peserta melaporkan views dengan bukti dan waktu tangkap. Maksimal tiga file, masing-masing 20 MB; maksimal 100 snapshot per posting.
- Reviewer menerima/menolak snapshot dengan catatan. Penerimaan views tidak langsung mengkredit saldo.
- Setelah cutoff, reviewer menerbitkan penilaian berdasarkan snapshot yang diterima pada 60 menit terakhir sebelum cutoff. Fixed dapat tanpa snapshot. Tidak tersedia fallback untuk mengarang angka ketika bukti cutoff tidak ada.

## Keberatan dan settlement

Peserta mendapat 48 jam untuk keberatan terhadap tiap penilaian. Keberatan terbuka menahan settlement. Reviewer yang berbeda dari pembuat penilaian memeriksa kasus tersebut. Jika penilaian dibatalkan, hasilnya tetap tersimpan sebagai void dan reviewer menerbitkan penilaian baru; masa keberatan dimulai lagi.

Worker melakukan settlement satu kali per posting, melepaskan sisa reservasi dan mengkredit saldo pending. Setelah 24 jam, pending menjadi available. Jurnal dan mutasi saldo terjadi dalam satu transaksi.

Tidak ada fitur mengurangi saldo peserta secara sepihak setelah pembayaran final. Koreksi pascapembayaran memerlukan prosedur kasus keuangan terpisah sebelum ditambahkan sebagai fitur. Jangan memperbaiki saldo dengan SQL ad hoc di produksi.

## Rekening dan payout

1. Peserta menambah bank, nomor rekening dan pemilik. Nomor dienkripsi; UI biasa hanya menampilkan empat digit terakhir.
2. Finance membuka nomor lengkap dengan alasan yang diaudit dan memverifikasi bukti kepemilikan secara manual.
3. Rekening baru menunggu 24 jam setelah verifikasi. Permintaan memakai snapshot tujuan yang tidak berubah jika ada rekening baru.
4. Pengajuan minimum default Rp50.000, maksimum Rp500.000 per hari WIB, hanya satu pengajuan aktif. Saldo available dipindah ke held.
5. Peserta boleh membatalkan pengajuan yang belum disetujui. Finance tidak dapat menyetujui pengajuan sendiri.
6. Finance memilih batch. Worker mengirim pada hari dan jam WIB yang dikonfigurasi.
7. Hanya respons/callback Flip yang cocok dengan ID, nominal dan tujuan dapat mengubah status final. DONE memindah held ke paid; CANCELLED final mengembalikan held ke available.
8. Timeout/hasil tidak pasti tetap held dan butuh rekonsiliasi. Jangan membuat provider key baru untuk percobaan teknis pada transaksi yang sama.

## Pemantauan operator

- Periksa status web, worker, migrasi, kapasitas disk, backup, antrean `outbox` gagal dan kasus rekonsiliasi.
- Callback final yang datang sebelum respons create menyimpan ID dapat memerlukan tombol Cek ke Flip oleh finance. Sistem tidak menganggap dana gagal hanya karena callback awal belum terhubung.
- Email job gagal akan dicoba ulang sampai delapan kali; perbaiki SMTP dan lakukan pemrosesan ulang yang diaudit, bukan mengirim token lama secara manual.
- Sesi, token kedaluwarsa dan rate counters lama dibersihkan worker. Retensi bukti, audit dan data keuangan harus ditetapkan pemilik; belum ada penghapusan otomatis data keuangan.
- Akses staf dicabut lewat Pengguna → ganti ke participant, yang menghapus seluruh sesi. Penonaktifan akun dan pemulihan TOTP yang hilang memerlukan prosedur operator; tidak ada pintasan reset faktor publik.

## Release gates pemilik

| Keputusan / akses       | Kondisi sebelum live                                        |
| ----------------------- | ----------------------------------------------------------- |
| Domain dan Dokploy      | APP_URL HTTPS benar, web port 3000, DB/worker privat        |
| Identitas dan kebijakan | Naskah final disahkan; kontak/retensi/hak materi jelas      |
| Email                   | SMTP serta SPF/DKIM/DMARC diuji                             |
| Staf                    | TOTP aktif; reviewer independen kedua tersedia              |
| Rekening                | Prosedur verifikasi dan biaya transfer disepakati           |
| Flip Bisnis             | Sandbox callback, gagal, timeout dan rekonsiliasi lolos UAT |
| Pendanaan               | Deposit Flip dan budget kampanye tersedia di proses bisnis  |
| Backup                  | DB + file + kunci terenkripsi dapat dipulihkan di staging   |
| Produksi                | Commit/image, volume, cookie, proxy dan worker diverifikasi |

Budget di aplikasi adalah kontrol pencatatan dan reservasi reward. Ia bukan bukti dana deposit Flip atau escrow sudah tersedia. Pengelola harus merekonsiliasi dana operasional di luar platform.
