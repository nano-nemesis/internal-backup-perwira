# Deployment Guide — internal-backup-perwira

## Prerequisites

- Ubuntu 22.04 LTS
- PHP 8.1 + extensions: `php8.1-cli php8.1-fpm php8.1-mysql php8.1-mbstring php8.1-xml php8.1-curl php8.1-zip php8.1-bcmath`
- Composer 2.x
- MySQL 8.0 atau MariaDB 10.6+
- Node.js 18+ dan npm
- Nginx

---

## 1. Install Dependencies

```bash
# PHP 8.1
sudo add-apt-repository ppa:ondrej/php
sudo apt update
sudo apt install php8.1 php8.1-cli php8.1-fpm php8.1-mysql php8.1-mbstring php8.1-xml php8.1-curl php8.1-zip php8.1-bcmath

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
php8.1 artisan key:generate

# Run migrations
php8.1 artisan migrate

# Seed admin user (development only)
php8.1 artisan db:seed

# Create storage symlink (optional)
php8.1 artisan storage:link

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

## 7. Start Laravel (PHP-FPM or artisan serve)

For production with Nginx, run Laravel with PHP-FPM atau dengan artisan serve:

**Development / simple deployment:**
```bash
cd /var/www/internal-backup-perwira/backend
php8.1 artisan serve --host=127.0.0.1 --port=8000 &
```

**Production (systemd):**
```bash
# Create service
sudo tee /etc/systemd/system/backup-api.service <<EOF
[Unit]
Description=Laravel API - internal-backup-perwira
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/internal-backup-perwira/backend
ExecStart=/usr/bin/php8.1 artisan serve --host=127.0.0.1 --port=8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now backup-api
```

---

## 8. Queue Worker (Systemd)

```bash
sudo cp /var/www/internal-backup-perwira/deploy/queue-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-queue
sudo systemctl status backup-queue
```

---

## 9. Scheduler (Systemd)

```bash
sudo cp /var/www/internal-backup-perwira/deploy/scheduler.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now backup-scheduler
sudo systemctl status backup-scheduler
```

---

## 10. Verify

```bash
# Check all services
sudo systemctl status nginx backup-api backup-queue backup-scheduler

# Test API
curl http://localhost/api/setup/status

# View logs
sudo journalctl -u backup-queue -f
sudo journalctl -u backup-scheduler -f
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
