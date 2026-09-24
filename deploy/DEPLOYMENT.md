# Deployment Guide — internal-backup-perwira

## Cara cepat — skrip otomatis

Untuk VPS Ubuntu baru, seluruh panduan di bawah sudah dibungkus jadi satu skrip yang
menanyakan hal-hal berisiko sebelum menjalankannya:

```bash
sudo apt update && sudo apt install -y git
sudo git clone https://github.com/nano-nemesis/internal-backup-perwira.git \
     /var/www/internal-backup-perwira
cd /var/www/internal-backup-perwira
sudo bash deploy/vps-setup.sh
```

Skrip ini **aman dijalankan berulang** — dipakai juga untuk memperbarui
(`git pull` lalu jalankan lagi). Yang dijaga khusus:

- **`APP_KEY` tidak pernah diganti** kalau sudah ada. Menggantinya membuat semua
  password SSH/DB node yang tersimpan tidak bisa didekripsi.
- **Password database tidak dirotasi** pada jalan ulang — dibaca kembali dari `.env`.
- `.env` lama dicadangkan sebelum disunting.
- `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, dan `APP_URL` diarahkan ke IP VPS.
  Tanpa itu login **tidak akan pernah berhasil** lewat `http://IP_VPS`: Sanctum hanya
  memakai sesi cookie untuk domain yang terdaftar stateful, dan `SESSION_DOMAIN=localhost`
  membuat browser tidak pernah mengirim cookie sesinya ke alamat IP.
- Kalau ada `backup-api.service` sisa deploy lama (`artisan serve`), ditawarkan untuk
  dimatikan dan dihapus.

Bagian di bawah adalah rujukan manual — berguna untuk memahami atau memperbaiki
langkah tertentu kalau skripnya berhenti di tengah.

---

## Prerequisites

- Ubuntu 22.04 LTS
- PHP 8.3 + extensions: `php8.3-cli php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath`
- Composer 2.x
- MySQL 8.0 atau MariaDB 10.6+
- Node.js 18+ dan npm
- Nginx

---

## 1. Install Dependencies

```bash
# PHP 8.3
sudo add-apt-repository ppa:ondrej/php
sudo apt update
sudo apt install php8.3 php8.3-cli php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

# Nginx & MySQL
sudo apt install nginx mysql-server
```

---

## 2. Database Setup

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE internal_backup_perwira CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'backup_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON internal_backup_perwira.* TO 'backup_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 3. Clone & Install

```bash
sudo mkdir -p /var/www/internal-backup-perwira
sudo chown $USER:$USER /var/www/internal-backup-perwira

# Clone project
git clone <repo-url> /var/www/internal-backup-perwira
cd /var/www/internal-backup-perwira
```

---

## 4. Backend Setup

```bash
cd /var/www/internal-backup-perwira/backend

# Install PHP dependencies
composer install --no-dev --optimize-autoloader

# Configure environment
cp .env.example .env
nano .env  # Fill in DB credentials, TELEGRAM config, etc.

# Generate app key
php8.3 artisan key:generate

# Run migrations
php8.3 artisan migrate

# Seed admin user (development only)
php8.3 artisan db:seed

# Storage symlink — TIDAK diperlukan oleh aplikasi ini.
# Berkas backup diunduh lewat /api/backup-files/download dan
# /api/nodes/{id}/download/{file}, bukan lewat /storage, dan deploy/nginx.conf
# memang tidak lagi melayani /storage. Jalankan hanya kalau Anda menambahkan
# sendiri berkas publik di disk 'public'.
# php8.3 artisan storage:link

# Fix permissions
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

---

## 5. Frontend Build

```bash
cd /var/www/internal-backup-perwira/frontend

npm install
npm run build
# Output: frontend/dist/
```

---

## 6. Nginx Setup

```bash
# Copy nginx config
sudo cp /var/www/internal-backup-perwira/deploy/nginx.conf /etc/nginx/sites-available/internal-backup-perwira

# Enable site
sudo ln -s /etc/nginx/sites-available/internal-backup-perwira /etc/nginx/sites-enabled/

# Remove default
sudo rm -f /etc/nginx/sites-enabled/default

# Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. PHP-FPM

Laravel dijalankan oleh **php-fpm**, bukan `artisan serve`.

> `artisan serve` adalah server pengembangan bawaan PHP: ia melayani **satu request pada
> satu waktu**. Satu unduhan backup besar akan membekukan seluruh API selama unduhan
> berlangsung — dashboard mati dan backup manual tidak bisa dipicu. Jangan dipakai di VPS.

```bash
# Pool default Ubuntu sudah berjalan sebagai www-data — sama dengan pemilik storage/
# dan dengan queue worker, jadi tidak ada yang perlu diubah soal izin berkas.
sudo systemctl enable --now php8.3-fpm

# Pastikan soketnya ada dan namanya cocok dengan deploy/nginx.conf
ls -l /run/php/php8.3-fpm.sock
```

Kalau path soketnya berbeda (mis. versi PHP lain), sesuaikan baris `fastcgi_pass` di
[nginx.conf](nginx.conf).

### Ukuran pool

`deploy/nginx.conf` mematikan `fastcgi_buffering` supaya unduhan backup besar tidak ditulis
dulu ke berkas sementara. Konsekuensinya **satu worker php-fpm tertahan selama unduhan
berlangsung**, jadi pool tidak boleh terlalu kecil:

```bash
sudo nano /etc/php/8.1/fpm/pool.d/www.conf
```

```ini
pm = dynamic
pm.max_children = 10        ; naikkan kalau beberapa orang mengunduh backup bersamaan
pm.start_servers = 2
pm.min_spare_servers = 2
pm.max_spare_servers = 4
```

Perkiraan kasar: `pm.max_children` ≈ RAM yang boleh dipakai PHP dibagi ~40 MB per worker.

```bash
sudo systemctl restart php8.3-fpm
```

### Opsional: cache konfigurasi

```bash
cd /var/www/internal-backup-perwira/backend
php8.3 artisan config:cache
php8.3 artisan route:cache
```

> Ulangi kedua perintah itu **setiap kali `.env` diubah** — kalau tidak, perubahan `.env`
> tidak terbaca. Batalkan dengan `artisan config:clear && artisan route:clear`.

---

## 8. Queue Worker (Systemd)

```bash
sudo cp /var/www/internal-backup-perwira/deploy/backup-queue.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-queue
sudo systemctl status backup-queue
```

---

## 9. Scheduler (Systemd)

```bash
sudo cp /var/www/internal-backup-perwira/deploy/backup-scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-scheduler
sudo systemctl status backup-scheduler
```

---

## 10. Verify

```bash
# Check all services
sudo systemctl status nginx php8.3-fpm backup-queue backup-scheduler

# Test API
curl http://localhost/api/setup/status

# View logs
sudo journalctl -u backup-queue -f
sudo journalctl -u backup-scheduler -f
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/www/internal-backup-perwira/backend/storage/logs/laravel.log
```

---

## First Login

- Open: `http://your-server-ip/`
- If no users exist, you will be redirected to `/setup`
- Create your admin account
- Default dev seeder: username `admin`, password `password123`

---

## Environment Variables (Key)

| Variable | Description |
|---|---|
| `APP_KEY` | Laravel encryption key (auto-generated) |
| `DB_*` | MySQL connection details |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat/group ID |
| `BACKUP_RETENTION_DAYS` | Days to keep old backups (default: 7) |
| `SSH_TIMEOUT` | SSH connection timeout in seconds (default: 30) |
| `ALERT_COOLDOWN_MINUTES` | Min minutes between failed backup alerts per node |

---

## Storage Layout

```
storage/app/backups/
  mikrotik/{node-name}/    ← MikroTik .rsc files
  database/{node-name}/    ← MySQL .sql.gz dumps
```

## HTTPS (backup.thama.web.id)

Domain lewat Cloudflare (mode SSL Full), jadi server wajib melayani port 443. Sertifikat
Let's Encrypt diambil sekali lewat webroot; `vps-setup.sh` otomatis mengaktifkan baris
`#TLS` di `nginx.conf` begitu sertifikatnya ada. Perpanjangan ditangani `certbot.timer`.

```bash
apt-get install -y certbot && mkdir -p /var/www/letsencrypt
certbot certonly --webroot -w /var/www/letsencrypt -d backup.thama.web.id \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --deploy-hook "systemctl reload nginx"
sudo bash deploy/vps-setup.sh   # atau buka komentar #TLS manual lalu reload nginx
```

Rute default server harus tetap lewat gateway lokal `10.29.0.1` (IP keluar `163.61.159.9`):
server database dan router 10.28.0.x hanya mengizinkan IP itu. IP publik `41.216.191.51`
cukup sebagai alamat kedua untuk akses masuk.
