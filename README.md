# Internal Backup Perwira

Sistem manajemen backup internal untuk **PerwiraMedia**. Aplikasi ini otomatis mem-backup
router MikroTik (konfigurasi `/export`) dan database MySQL/MariaDB melalui SSH secara
terjadwal, menyimpan hasilnya di VPS backup, menerapkan kebijakan retensi, mengirim notifikasi
Telegram, dan menampilkan semuanya lewat dashboard web.

Proyek ini berupa monorepo dengan dua aplikasi:

| Path | Stack | Peran |
|---|---|---|
| [backend/](backend/) | Laravel 10 (PHP 8.1) + Sanctum | REST API, mesin backup, scheduler, queue jobs |
| [frontend/](frontend/) | React 18 + TypeScript + Vite + Tailwind | Dashboard satu halaman (SPA) |
| [deploy/](deploy/) | Nginx + systemd units | Artefak deployment produksi |

---

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Cara Kerja Backup](#cara-kerja-backup)
- [Model Penjadwalan](#model-penjadwalan)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Pengembangan Lokal](#pengembangan-lokal)
- [Konfigurasi](#konfigurasi)
- [Autentikasi SSH Key](#autentikasi-ssh-key)
- [Referensi API](#referensi-api)
- [Role & Hak Akses](#role--hak-akses)
- [Skema Database](#skema-database)
- [Tata Letak Penyimpanan](#tata-letak-penyimpanan)
- [Deployment Produksi](#deployment-produksi)
- [Catatan Keamanan](#catatan-keamanan)

---

## Fitur

- **Dua tipe node backup**
  - **MikroTik** — menjalankan `/export` lewat SSH dan menyimpan file konfigurasi `.rsc`.
  - **Database** — menjalankan `mysqldump` lewat SSH, menangkap SQL teks, lalu meng-gzip-nya
    secara lokal menjadi file `.sql.gz`.
- **Penjadwalan otomatis** — setiap node punya interval (dalam jam) yang bisa diatur.
  Scheduler per-menit men-dispatch backup yang sudah waktunya, di-align ke tengah malam
  `Asia/Jakarta` (WIB).
- **Eksekusi berbasis queue** — backup berjalan sebagai queued job di queue khusus `backup`,
  memisahkan operasi SSH yang lama dari siklus request web.
- **Kebijakan retensi** — backup yang lebih tua dari `BACKUP_RETENTION_DAYS` (default 7)
  otomatis dihapus setelah backup sukses.
- **Notifikasi Telegram** — peringatan sukses/gagal dengan cooldown per-node agar tidak spam,
  plus notifikasi "recovery" otomatis saat node yang sebelumnya gagal kembali berhasil.
- **Metrik VPS** — mengumpulkan CPU, memori, disk, dan load average host backup setiap menit
  (disimpan 24 jam) dan menampilkannya dalam grafik di dashboard.
- **Terminal remote MikroTik** — admin bisa menjalankan perintah RouterOS (yang di-whitelist)
  ke sebuah node langsung dari UI.
- **Browser file backup** — menampilkan daftar dan mengunduh artefak backup yang tersimpan.
- **Alur setup awal** — saat belum ada user, aplikasi memandu pembuatan akun admin pertama.
- **Kontrol akses berbasis role** — `admin`, `operator`, dan `viewer`.
- **Kredensial terenkripsi** — password SSH dan database disimpan terenkripsi memakai app key
  Laravel.

---

## Arsitektur

```
                         ┌──────────────────────────────┐
   Browser (SPA)  ─────► │  Nginx                        │
                         │   /        → frontend/dist     │
                         │   /api     → Laravel :8000     │
                         │   /storage → Laravel :8000     │
                         └───────────────┬───────────────┘
                                         │
                         ┌───────────────▼───────────────┐
                         │  Laravel API (Sanctum cookie  │
                         │  session auth)                │
                         └───┬─────────────┬─────────────┘
                             │             │
          ┌──────────────────▼──┐   ┌──────▼───────────────────┐
          │ Scheduler (systemd) │   │ Queue worker (systemd)   │
          │ setiap menit:       │   │ queue=backup             │
          │  • backup:run-      │   │  • BackupJob → SSH ke     │
          │    scheduled        │──►│    target → simpan file   │
          │  • metrics:collect  │   │  • notifikasi Telegram    │
          └─────────────────────┘   └──────────────────────────┘
                             │
                    ┌────────▼─────────┐         ┌────────────────────┐
                    │ MySQL (DB app +  │         │ Node target         │
                    │ queue jobs)      │         │  • MikroTik (SSH)   │
                    └──────────────────┘         │  • Server DB (SSH)  │
                                                 └────────────────────┘
```

Frontend berkomunikasi dengan backend hanya melalui `/api`, memakai **autentikasi session
berbasis cookie Sanctum** (`withCredentials`). Di mode development, Vite mem-proxy `/api`,
`/sanctum`, dan `/storage` ke server dev Laravel di port 8000.

---

## Cara Kerja Backup

Backup dikoordinasi oleh [`BackupService`](backend/app/Services/BackupService.php):

1. Sebuah baris `BackupLog` dibuat dengan status `running`.
2. Berdasarkan `node.type`, dialihkan ke service yang sesuai:
   - **MikroTik** ([`MikrotikService`](backend/app/Services/MikrotikService.php)) — membuka
     koneksi SSH via `proc_open` (memakai `ssh` + `sshpass`, atau private key) dan menjalankan
     `/export`. Outputnya ditulis ke file `.rsc`.

     > Catatan: ini sengaja **tidak** memakai `spatie/ssh`. Library tersebut membungkus setiap
     > perintah dalam heredoc (`<< \EOF-SPATIE-SSH`), yang tidak didukung RouterOS 6.x dan
     > menyebabkan output selalu kosong. Perintah dikirim langsung sebagai argumen SSH.
   - **Database** ([`DatabaseBackupService`](backend/app/Services/DatabaseBackupService.php))
     — menjalankan `mysqldump --single-transaction --quick --lock-tables=false` lewat SSH (via
     `spatie/ssh`), memvalidasi outputnya benar-benar SQL dump, lalu meng-kompresnya dengan
     `gzip` native PHP menjadi `.sql.gz`. SQL ditangkap sebagai teks (bukan dipipe ke `gzip`
     remote) agar stdout tidak korup.
3. Saat sukses: log diperbarui (`success`, ukuran file, durasi), `last_backup_at` diisi,
   notifikasi sukses Telegram dikirim, dan backup lama dibersihkan.
4. Saat gagal: log mencatat error, peringatan gagal Telegram dikirim (dibatasi cooldown).
5. Jadwal node dimajukan apa pun hasilnya.

Backup bisa dipicu lewat tiga cara:

- **Otomatis** oleh scheduler saat node sudah waktunya.
- **Manual** lewat `POST /api/nodes/{id}/backup` (admin/operator).
- Keduanya men-dispatch [`BackupJob`](backend/app/Jobs/BackupJob.php) yang sama ke queue
  `backup`.

---

## Model Penjadwalan

Penjadwalan sengaja **di-align ke tengah malam WIB** (`Asia/Jakarta`), diimplementasikan di
[`HasAlignedSchedule`](backend/app/Traits/HasAlignedSchedule.php):

- Node yang baru ditambahkan dijadwalkan **pertama kali besok jam 00:00 WIB**, tidak peduli
  kapan node itu dibuat.
- Run berikutnya jatuh pada slot yang sudah di-align: `00:00`, lalu setiap `interval_hours`
  setelahnya (mis. interval 6 jam → 00:00, 06:00, 12:00, 18:00 WIB).
- Perintah [`backup:run-scheduled`](backend/app/Console/Commands/RunScheduledBackups.php)
  berjalan setiap menit. Untuk menghindari **race condition** yang sebelumnya menyebabkan job
  ganda, perintah ini memajukan `next_run_at` **sebelum** men-dispatch job, sehingga tick
  per-menit berikutnya tidak men-dispatch ulang node yang job-nya masih berjalan.

`metrics:collect` juga berjalan setiap menit dan menghapus metrik yang lebih tua dari 24 jam.

---

## Tech Stack

**Backend**
- PHP 8.1, Laravel 10
- Laravel Sanctum 3 (autentikasi cookie SPA)
- `spatie/ssh` (SSH database), `sshpass`/`ssh` via `proc_open` (SSH MikroTik)
- `doctrine/dbal`
- MySQL 8 / MariaDB 10.6+ (juga jadi driver queue database)

**Frontend**
- React 18 + TypeScript
- Vite 5
- TanStack React Query 5
- React Router 6
- Tailwind CSS 3, komponen UI bergaya Radix, ikon `lucide-react`
- Recharts (grafik metrik & status)
- Axios

---

## Struktur Proyek

```
internal-backup-perwira/
├── backend/                      # API Laravel + mesin backup
│   ├── app/
│   │   ├── Console/Commands/     # backup:run-scheduled, metrics:collect
│   │   ├── Http/Controllers/     # Auth, Node, BackupFiles, VpsMetrics, Admin/*
│   │   ├── Http/Middleware/      # CheckRole (role:), EnsureUserIsActive (active)
│   │   ├── Jobs/BackupJob.php
│   │   ├── Models/               # Node, BackupLog, NodeSchedule, VpsMetric, User
│   │   ├── Services/             # BackupService, MikrotikService, DatabaseBackupService,
│   │   │                         #   VpsMetricsService, TelegramNotifier
│   │   └── Traits/HasAlignedSchedule.php
│   ├── config/backup.php         # Retensi, paralelisme, timeout, Telegram, timezone
│   ├── database/migrations/      # users, nodes, backup_logs, node_schedules,
│   │                             #   vps_metrics, jobs, personal_access_tokens
│   ├── routes/api.php            # Semua endpoint API
│   └── .env.example
├── frontend/                     # SPA React
│   └── src/
│       ├── pages/                # Login, Setup, Dashboard, Devices, NodeDetail,
│       │                         #   BackupFiles, Admin
│       ├── components/           # layout/, nodes/, charts/, dashboard/, logs/, ui/
│       ├── hooks/                # useNodes, useUsers, useBackupFiles, useVpsMetrics
│       ├── context/AuthContext.tsx
│       ├── routes/               # AppRoutes + AuthGuard
│       └── lib/                  # axios, queryClient, utils
├── deploy/                       # nginx.conf + systemd units + DEPLOYMENT.md
└── SECURITY_AUDIT.md
```

---

## Pengembangan Lokal

### Prasyarat

- PHP 8.1 dengan ekstensi `cli`, `mysql`, `mbstring`, `xml`, `curl`, `zip`, `bcmath`
- Composer 2.x
- Node.js 18+ dan npm
- MySQL 8 / MariaDB 10.6+
- `ssh` dan `sshpass` tersedia di host backup (untuk backup SSH berbasis password)

### Backend

```bash
cd backend

composer install
cp .env.example .env
php artisan key:generate

# Isi kredensial DB di .env, lalu:
php artisan migrate

# Opsional: admin dev (username: admin / password: password123)
php artisan db:seed

# Jalankan API
php artisan serve --host=127.0.0.1 --port=8000
```

Di terminal terpisah, jalankan queue worker dan scheduler agar backup benar-benar dieksekusi:

```bash
php artisan queue:work --queue=backup --tries=1 --timeout=300
php artisan schedule:work          # atau: jalankan schedule:run setiap menit
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Server dev Vite di http://localhost:5173, proxy /api → :8000
```

Buka aplikasinya — jika belum ada user, Anda akan diarahkan ke `/setup` untuk membuat akun
admin pertama. Jika sudah ada, login di `/login`.

Untuk membuat bundle produksi:

```bash
npm run build        # output ke frontend/dist/
```

---

## Konfigurasi

Konfigurasi backend ada di `backend/.env` (lihat [.env.example](backend/.env.example)).
Variabel penting:

| Variabel | Default | Keterangan |
|---|---|---|
| `APP_KEY` | — | Kunci enkripsi Laravel (di-generate otomatis; **juga mengenkripsi kredensial node**) |
| `DB_*` | — | Detail koneksi MySQL |
| `QUEUE_CONNECTION` | `database` | Backup memakai queue `backup` pada koneksi ini |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost,...` | Domain yang diizinkan untuk auth cookie SPA |
| `SESSION_DRIVER` | `cookie` | Penyimpanan session |
| `TELEGRAM_BOT_TOKEN` | — | Token bot Telegram (notifikasi nonaktif bila kosong) |
| `TELEGRAM_CHAT_ID` | — | ID chat/grup tujuan |
| `BACKUP_RETENTION_DAYS` | `7` | Berapa hari file backup disimpan sebelum dihapus |
| `BACKUP_MAX_PARALLEL` | `5` | Maksimum backup paralel yang dikonfigurasi |
| `SSH_TIMEOUT` | `30` | Timeout koneksi/perintah SSH dalam detik |
| `BACKUP_TIMEZONE` | `Asia/Jakarta` | Timezone untuk alignment jadwal |
| `ALERT_COOLDOWN_MINUTES` | `30` | Jeda minimum antar peringatan gagal per node |
| `FRONTEND_DIR` | `../frontend/dist` | Path SPA hasil build yang disajikan route fallback Laravel |

> ⚠️ Password SSH/DB node dienkripsi dengan `APP_KEY`. **Mengganti `APP_KEY` setelah ada node
> akan membuat kredensial yang tersimpan tidak bisa didekripsi.**

---

## Autentikasi SSH Key

Setiap node terhubung ke targetnya dengan salah satu dari dua cara:

- **Password** — isi `ssh_password` pada node. MikroTik memakai `sshpass`, node database
  memakai autentikasi password `spatie/ssh`.
- **SSH key** — isi `ssh_key_path` pada node dengan **path absolut ke file private key** di
  host backup. Saat `ssh_key_path` terisi dan file-nya ada, key dipakai dan password
  diabaikan ([`MikrotikService`](backend/app/Services/MikrotikService.php),
  [`DatabaseBackupService`](backend/app/Services/DatabaseBackupService.php)).

Karena backup berjalan di dalam queue worker (sebagai `www-data` di produksi), private key
harus **bisa dibaca oleh user tersebut**. Yang dipasang di tiap target adalah **public key**-nya.

### Langkah 1 — Generate keypair di host backup

Jalankan ini di mesin yang menjalankan aplikasi ini (bukan di target). Simpan key di luar
direktori yang disajikan web:

```bash
# Sebagai user yang menjalankan queue worker (www-data di produksi)
sudo -u www-data mkdir -p /var/www/internal-backup-perwira/backend/storage/app/ssh
sudo -u www-data ssh-keygen -t ed25519 \
  -f /var/www/internal-backup-perwira/backend/storage/app/ssh/id_node \
  -N "" -C "perwira-backup"

# Kunci private key
sudo chmod 600 /var/www/internal-backup-perwira/backend/storage/app/ssh/id_node
sudo chown www-data:www-data /var/www/internal-backup-perwira/backend/storage/app/ssh/id_node
```

Ini menghasilkan:
- `id_node`     → **private** key → diisi ke field **SSH Key Path** pada node
- `id_node.pub` → **public** key  → dipasang di target (langkah di bawah)

> Aplikasi menonaktifkan strict host-key checking, jadi Anda tidak perlu pre-accept host key
> target. Field `ssh_key_path` menolak nilai yang mengandung `..`, jadi pakai path absolut
> yang bersih.

### Langkah 2a — Target VPS Linux (node database / PerwiraCloud)

Tambahkan **public** key ke `authorized_keys` milik user SSH di server target. Ini user yang
sama dengan `ssh_user` pada node (mis. user khusus `backup_user`).

```bash
# Paling mudah: ssh-copy-id dari host backup
sudo -u www-data ssh-copy-id -i \
  /var/www/internal-backup-perwira/backend/storage/app/ssh/id_node.pub \
  backup_user@HOST_TARGET

# Atau manual (salin isi id_node.pub, lalu di server TARGET):
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAA... perwira-backup' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Target juga butuh `mysqldump` terpasang dan user MySQL dengan minimal hak
`SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER` pada database yang akan di-backup
(lihat [`DatabaseBackupService`](backend/app/Services/DatabaseBackupService.php) untuk grant
persisnya).

### Langkah 2b — Target MikroTik CHR (node mikrotik)

Di MikroTik, public key di-import dan diikat ke user RouterOS tertentu.

1. **Upload** public key ke router (dari host backup):

   ```bash
   scp /var/www/internal-backup-perwira/backend/storage/app/ssh/id_node.pub \
     admin@HOST_MIKROTIK:id_node.pub
   ```

   (Bisa juga seret file `.pub` ke menu **Files** di WinBox/WebFig.)

2. **Buat/siapkan user SSH** dengan policy yang dibutuhkan. Backup menjalankan `/export`, yang
   butuh policy `read`; `ssh` dibutuhkan untuk login. Tambahkan `write`/`policy` hanya jika
   Anda akan memakai fitur **remote execute** (admin).

   ```
   /user add name=backup group=read password=""
   ```

   > User grup `read` sudah cukup untuk backup. Untuk eksekusi perintah remote dari UI, pakai
   > grup yang juga punya `write` (dan `policy` untuk perintah sensitif).

3. **Import** public key dan ikat ke user tersebut (di terminal RouterOS):

   ```
   /user ssh-keys import public-key-file=id_node.pub user=backup
   ```

4. Set node di aplikasi ini dengan `ssh_user=backup` dan **SSH Key Path** menunjuk ke private
   `id_node`. Kosongkan field password.

### Langkah 3 — Verifikasi

Tes koneksi secara manual sebagai user worker sebelum mengandalkan scheduler:

```bash
# VPS Database
sudo -u www-data ssh -i .../storage/app/ssh/id_node backup_user@HOST_TARGET 'mysqldump --version'

# MikroTik
sudo -u www-data ssh -i .../storage/app/ssh/id_node backup@HOST_MIKROTIK '/export'
```

Jika keduanya berhasil, picu backup manual dari UI (atau `POST /api/nodes/{id}/backup`) untuk
mengonfirmasi end-to-end.

---

## Referensi API

Semua endpoint berprefiks `/api`. Autentikasi memakai cookie session Sanctum.

### Publik

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/setup/status` | Apakah sudah ada user (`has_users`) |
| `POST` | `/setup` | Membuat akun admin pertama (hanya bila belum ada user) |
| `POST` | `/login` | Login (rate-limit: 5 percobaan / 5 menit per IP) |

### Terautentikasi (`auth:sanctum` + akun aktif)

| Method | Endpoint | Role Min | Keterangan |
|---|---|---|---|
| `POST` | `/logout` | semua | Logout |
| `GET` | `/me` | semua | User saat ini |
| `GET` | `/nodes` | viewer | Daftar node + statistik agregat |
| `GET` | `/nodes/{id}` | viewer | Detail node, log (100 terakhir), file backup |
| `GET` | `/nodes/{id}/download/{filename}` | viewer | Unduh file backup (aman dari path traversal) |
| `POST` | `/nodes/{id}/backup` | operator | Picu backup manual (throttled) |
| `POST` | `/nodes/{id}/execute` | admin | Jalankan perintah MikroTik (whitelist, throttled) |
| `GET` | `/vps-metrics` | semua | Metrik VPS (1 jam terakhir + terbaru) |
| `GET` | `/backup-files` | semua | Daftar file backup (paginasi) |
| `GET` | `/backup-files/download` | semua | Unduh file backup |
| `GET` | `/admin/nodes` | operator | Daftar node (tampilan manajemen) |
| `POST` | `/admin/nodes` | operator | Buat node |
| `GET` | `/admin/nodes/{id}` | operator | Ambil node |
| `PUT` | `/admin/nodes/{id}` | operator | Update node |
| `PATCH` | `/admin/nodes/{id}/toggle` | operator | Toggle status aktif |
| `DELETE` | `/admin/nodes/{id}` | operator | Hapus node |
| `DELETE` | `/admin/nodes/bulk` | admin | Hapus node massal |
| `DELETE` | `/admin/nodes/all` | admin | Hapus semua node |
| `GET` | `/admin/users` | admin | Daftar user |
| `POST` | `/admin/users` | admin | Buat user |
| `PATCH` | `/admin/users/{id}/role` | admin | Ubah role user |
| `PATCH` | `/admin/users/{id}/password` | admin | Reset password user |
| `DELETE` | `/admin/users/{id}` | admin | Hapus user |

Rate limit: API global `120/menit` per user/IP; `backup-trigger` dan `remote-execute` punya
limiter khusus yang didefinisikan di
[`AppServiceProvider`](backend/app/Providers/AppServiceProvider.php).

---

## Role & Hak Akses

Ditegakkan oleh middleware [`CheckRole`](backend/app/Http/Middleware/CheckRole.php)
(alias `role:`) dan [`EnsureUserIsActive`](backend/app/Http/Middleware/EnsureUserIsActive.php)
(alias `active`). Akun nonaktif ditolak saat login dan pada setiap request.

| Role | Kemampuan |
|---|---|
| **viewer** | Melihat node, log, metrik; mengunduh backup |
| **operator** | Semua kemampuan viewer + buat/update/hapus node, picu backup |
| **admin** | Semua + manajemen user, remote execute MikroTik, hapus node massal |

---

## Skema Database

| Tabel | Tujuan |
|---|---|
| `users` | PK UUID; `username`, `email`, `password` (hashed), `role`, `is_active` |
| `nodes` | PK UUID; koneksi + kredensial (terenkripsi), `type`, `schedule_interval_hours`, `is_active`, `last_backup_at` |
| `backup_logs` | PK UUID; `status` per run, `file_path`, `file_size`, `duration_seconds`, `error_message`, timestamp |
| `node_schedules` | `next_run_at` / `last_run_at` / `interval_hours` per node |
| `vps_metrics` | Snapshot CPU/memori/disk/load host backup |
| `jobs` | Queue database Laravel |
| `personal_access_tokens` | Token Sanctum |

---

## Tata Letak Penyimpanan

Artefak backup disimpan di `backend/storage/app/backups/`:

```
storage/app/backups/
├── mikrotik/{nama-node}/    # File konfigurasi .rsc MikroTik
└── database/{nama-node}/    # Dump .sql.gz MySQL/MariaDB
```

Nama file diberi timestamp, mis. `backup-{node}-2026-06-06-14.30WIB.sql.gz`.

---

## Deployment Produksi

Direktori [deploy/](deploy/) berisi semua yang dibutuhkan untuk deployment Ubuntu 22.04 +
Nginx. Lihat **[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md)** untuk panduan lengkap
langkah demi langkah. Ringkasnya:

1. Install PHP 8.1, Composer, Node 18, Nginx, MySQL.
2. Buat database dan user MySQL khusus.
3. `composer install --no-dev --optimize-autoloader`, konfigurasi `.env`, `key:generate`,
   `migrate`.
4. `npm install && npm run build` di `frontend/`.
5. Pasang [deploy/nginx.conf](deploy/nginx.conf) (menyajikan SPA, mem-proxy `/api`,
   `/sanctum`, `/storage` ke Laravel di `127.0.0.1:8000`).
6. Jalankan API, queue worker, dan scheduler sebagai service systemd:
   - [deploy/queue-worker.service](deploy/queue-worker.service) — `queue:work --queue=backup`
   - [deploy/scheduler.service](deploy/scheduler.service) — `schedule:run` tiap 60 detik
   - Unit `backup-api` yang menjalankan `artisan serve` (template ada di panduan deployment)

> Untuk backup SSH berbasis password, pastikan `sshpass` terpasang di host backup. Untuk
> backup database, server target butuh `mysqldump` (mysql-client) dan user MySQL dengan minimal
> hak `SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER` pada database target.

---

## Catatan Keamanan

- **Kredensial saat tersimpan** — password SSH dan DB dienkripsi via `encrypt()` Laravel
  (terikat `APP_KEY`) dan disembunyikan dari respons API.
- **Auth** — session cookie SPA Sanctum; login dibatasi rate per IP; akun nonaktif diblokir.
- **Path traversal** — unduhan backup memakai pengecekan `basename()` + `realpath()` agar
  akses tetap di dalam direktori backups.
- **Remote execute MikroTik** — input divalidasi terhadap whitelist karakter aman RouterOS
  untuk memblokir metakarakter shell sebelum perintah sampai ke perangkat.
- Audit tersendiri tercatat di [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

> Seeder development membuat `admin` / `password123`. **Jangan pakai seeder dev di produksi** —
> gunakan alur `/setup` untuk membuat admin pertama, atau segera ganti passwordnya.

---

_Tooling internal untuk PerwiraMedia. Tidak ditujukan untuk penggunaan publik/multi-tenant._
