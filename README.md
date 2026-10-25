# PinjolGuard (prototype)

Bot chat yang membantu orang sebelum mengambil pinjaman online:

1. **Cek legalitas**: user ketik nama aplikasi/platform, bot cek apakah tercatat *berizin OJK*, masuk daftar *ilegal*, atau *tidak ketemu*.
2. **Cek kemampuan bayar**: user isi penghasilan, pengeluaran, cicilan berjalan, dan tawaran pinjaman (jumlah, total bayar balik, tenor). Bot menghitung beban cicilan dan memberi status **Relatif aman / Hati-hati / Sebaiknya jangan**, plus *plafon aman* yang masuk akal untuk kondisi si user.

Tujuan kedua itu yang menjawab masalah "ngelebihin penghasilan demi limit tinggi": bot menunjukkan angka yang *sebenarnya mampu* dibayar, bukan limit yang ditawarkan aplikasi.

Tanpa dependensi eksternal. Python 3.9+ untuk versi terminal/API; versi web cukup browser (Node.js hanya dipakai untuk menjalankan tes).

## Tiga cara pakai, satu logika

```
core/            otak bot versi Python (tidak tahu soal channel)
  checker.py       cek legalitas (cocok persis / mirip / tidak ada)
  affordability.py hitung kemampuan bayar
  conversation.py  alur chat (state machine per user)
  parsing.py       baca "5jt", "2,5 juta", "750rb", "Rp 5.000.000"
v1_cli/          VERSI 1: simulasi chat di terminal
v2_api/          VERSI 2: API HTTP + adapter Telegram
web/             VERSI 3: situs web (HTML + JavaScript) untuk GitHub Pages
  core/            port JavaScript dari core/ (hasil harus identik, lihat bagian Tes)
data/            daftar platform (JSON), dipakai bersama oleh semua versi
tools/           csv_to_json.py (isi daftar resmi OJK), build_web.py, check_web.py, make_golden.py
tests/           tes Python + data acuan percakapan
.github/         workflow GitHub Actions: tes otomatis + deploy ke GitHub Pages
.devcontainer/   konfigurasi GitHub Codespaces
```

### Versi 1: terminal (paling cepat untuk demo)

```bash
python -m v1_cli.bot_cli
```
