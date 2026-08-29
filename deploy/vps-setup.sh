#!/usr/bin/env bash
#
# vps-setup.sh — pasang / perbarui internal-backup-perwira di VPS Ubuntu.
#
# Dijalankan DARI DALAM repo yang sudah di-clone:
#
#   sudo apt install -y git
#   sudo git clone https://github.com/nano-nemesis/internal-backup-perwira.git \
#        /var/www/internal-backup-perwira
#   cd /var/www/internal-backup-perwira
#   sudo bash deploy/vps-setup.sh
#
# Aman dijalankan berulang: setiap langkah memeriksa keadaan dulu, dan hal yang
# berisiko selalu ditanyakan. Akses lewat http://IP_VPS — tanpa domain, tanpa TLS.
#
set -Eeuo pipefail

# ── Tampilan ─────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\e[1m'; R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'; N=$'\e[0m'
else
  B=''; R=''; G=''; Y=''; C=''; N=''
fi
step() { printf '\n%s==> %s%s\n' "$C$B" "$*" "$N"; }
say()  { printf '    %s\n' "$*"; }
ok()   { printf '    %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '\n%sGAGAL:%s %s\n' "$R$B" "$N" "$*" >&2; exit 1; }

trap 'die "berhenti di baris $LINENO. Tidak ada langkah lanjutan yang dijalankan."' ERR

# ── Tanya-jawab ──────────────────────────────────────────────────────────────
ask_yn() { # ask_yn "pertanyaan" [y|n default]
  local q=$1 def=${2:-y} ans hint
  [[ $def == y ]] && hint='[Y/t]' || hint='[y/T]'
  while true; do
    read -r -p "    ${q} ${hint} " ans </dev/tty || die "butuh terminal interaktif"
    ans=${ans:-$def}
    case ${ans,,} in y|ya|yes) return 0;; t|n|tidak|no) return 1;; esac
  done
}
ask_val() { # ask_val "prompt" "default" -> stdout
  local q=$1 def=$2 ans
  read -r -p "    ${q} [${def}]: " ans </dev/tty || die "butuh terminal interaktif"
  printf '%s' "${ans:-$def}"
}
ask_secret() { # ask_secret "prompt" -> stdout
  local q=$1 ans
  read -r -s -p "    ${q}: " ans </dev/tty || die "butuh terminal interaktif"
  printf '\n' >&2
  printf '%s' "$ans"
}

# ── Preflight ────────────────────────────────────────────────────────────────
step "Pemeriksaan awal"
[[ $EUID -eq 0 ]] || die "jalankan sebagai root: sudo bash deploy/vps-setup.sh"
[[ -t 0 || -e /dev/tty ]] || die "skrip ini interaktif, butuh terminal"

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f "$APP_DIR/backend/artisan" && -f "$APP_DIR/frontend/package.json" ]] \
  || die "struktur repo tidak dikenali di $APP_DIR"
ok "Direktori aplikasi: $APP_DIR"

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  [[ ${ID:-} == ubuntu ]] || warn "diuji di Ubuntu 22.04; sistem ini: ${PRETTY_NAME:-tidak dikenal}"
fi

PHP_VER=8.1
PHP_BIN=/usr/bin/php${PHP_VER}
FPM_SOCK=/run/php/php${PHP_VER}-fpm.sock
FPM_SVC=php${PHP_VER}-fpm

# IP untuk akses — menentukan konfigurasi sesi/Sanctum, jadi harus benar.
DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || true)
[[ -n ${DETECTED_IP:-} ]] || DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
say "Aplikasi akan diakses lewat http://IP_VPS (tanpa domain, tanpa TLS)."
VPS_IP=$(ask_val "IP VPS yang dipakai mengakses dashboard" "${DETECTED_IP:-127.0.0.1}")
[[ -n $VPS_IP ]] || die "IP tidak boleh kosong"
ok "Akses nanti: http://${VPS_IP}"

# ── 1. Paket sistem ──────────────────────────────────────────────────────────
step "1/9  Paket sistem"
need_pkg=()
for p in nginx mysql-server git curl unzip sshpass \
         "php${PHP_VER}-cli" "php${PHP_VER}-fpm" "php${PHP_VER}-mysql" \
         "php${PHP_VER}-mbstring" "php${PHP_VER}-xml" "php${PHP_VER}-curl" \
         "php${PHP_VER}-zip" "php${PHP_VER}-bcmath"; do
  dpkg -s "$p" >/dev/null 2>&1 || need_pkg+=("$p")
done

if ((${#need_pkg[@]})); then
  say "Belum terpasang: ${need_pkg[*]}"
  if ask_yn "Pasang sekarang lewat apt?"; then
    apt-get update -qq
    if ! apt-cache policy "php${PHP_VER}-fpm" 2>/dev/null | grep -q 'Candidate: [0-9]'; then
      say "php${PHP_VER} tidak ada di repo bawaan, menambahkan PPA ondrej/php…"
      apt-get install -y -qq software-properties-common
      add-apt-repository -y ppa:ondrej/php >/dev/null
      apt-get update -qq
    fi
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need_pkg[@]}"
    ok "Paket terpasang"
  else
    die "paket wajib belum ada, tidak bisa lanjut"
  fi
else
  ok "Semua paket sistem sudah ada"
fi

# sshpass dipakai backup MikroTik berbasis password — tanpa itu SSH keluar 127.
command -v sshpass >/dev/null || warn "sshpass tidak ada: backup MikroTik via password akan gagal"

# Node 18+ (Ubuntu 22.04 bawaannya 12, terlalu tua untuk Vite 5)
NODE_MAJOR=$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p' || true)
NODE_MAJOR=${NODE_MAJOR:-0}
if (( NODE_MAJOR < 18 )); then
  say "Node.js terpasang: ${NODE_MAJOR:-tidak ada} — butuh 18+"
  if ask_yn "Pasang Node.js 18 dari NodeSource?"; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
    ok "Node.js $(node -v) terpasang"
  else
    die "build frontend butuh Node 18+"
  fi
else
  ok "Node.js $(node -v)"
fi

if ! command -v composer >/dev/null; then
  say "Composer belum ada."
  ask_yn "Pasang Composer?" || die "backend butuh Composer"
  curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
  "$PHP_BIN" /tmp/composer-setup.php --quiet --install-dir=/usr/local/bin --filename=composer
  rm -f /tmp/composer-setup.php
  ok "Composer $(composer --version 2>/dev/null | head -1)"
else
  ok "Composer sudah ada"
fi

# ── 2. Database ──────────────────────────────────────────────────────────────
step "2/9  Database MySQL"
systemctl is-active --quiet mysql || systemctl start mysql
ENV_FILE="$APP_DIR/backend/.env"

DB_NAME=internal_backup_perwira
DB_USER=backup_user
DB_PASS=""
# Jangan pernah merotasi password DB pada jalan ulang — ambil dari .env kalau ada.
if [[ -f $ENV_FILE ]]; then
  DB_NAME=$(grep -E '^DB_DATABASE=' "$ENV_FILE" | cut -d= -f2- || echo "$DB_NAME")
  DB_USER=$(grep -E '^DB_USERNAME=' "$ENV_FILE" | cut -d= -f2- || echo "$DB_USER")
  DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || echo "")
  if [[ -n $DB_PASS ]]; then ok "Kredensial DB dipakai ulang dari .env yang sudah ada"; fi
fi
[[ -n $DB_PASS ]] || { DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24); say "Password DB dibuat otomatis"; }

MYCNF=$(mktemp); chmod 600 "$MYCNF"
cleanup_mycnf() { rm -f "$MYCNF"; }
trap cleanup_mycnf EXIT
printf '[client]\nuser=root\n' > "$MYCNF"
if ! mysql --defaults-extra-file="$MYCNF" -e 'SELECT 1' >/dev/null 2>&1; then
  say "Login MySQL sebagai root lewat socket gagal."
  ROOT_PW=$(ask_secret "Password root MySQL")
  printf '[client]\nuser=root\npassword=%s\n' "$ROOT_PW" > "$MYCNF"
  mysql --defaults-extra-file="$MYCNF" -e 'SELECT 1' >/dev/null 2>&1 \
    || die "tidak bisa login ke MySQL sebagai root"
fi

# Escape untuk literal SQL
esc=${DB_PASS//\\/\\\\}; esc=${esc//\'/\\\'}
mysql --defaults-extra-file="$MYCNF" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${esc}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${esc}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
ok "Database '${DB_NAME}' dan user '${DB_USER}' siap"

# ── 3. Konfigurasi .env ──────────────────────────────────────────────────────
step "3/9  Konfigurasi .env"
if [[ ! -f $ENV_FILE ]]; then
  cp "$APP_DIR/backend/.env.example" "$ENV_FILE"
  ok ".env dibuat dari .env.example"
else
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
  ok ".env yang ada dicadangkan sebelum disunting"
fi

set_env() { # set_env KUNCI NILAI
  local k=$1 v=$2
  if grep -qE "^${k}=" "$ENV_FILE"; then
    # nilai ditulis lewat awk agar aman terhadap karakter khusus sed
    awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{print k "=" v; next} {print}' \
      "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
  fi
}

set_env APP_ENV production
set_env APP_DEBUG false
set_env APP_URL "http://${VPS_IP}"
set_env DB_DATABASE "$DB_NAME"
set_env DB_USERNAME "$DB_USER"
set_env DB_PASSWORD "$DB_PASS"

# INI YANG BIKIN LOGIN JALAN LEWAT IP.
# Sanctum hanya memakai sesi cookie untuk domain yang terdaftar stateful; kalau IP
# VPS tidak ada di sini, /api/me selalu 401 dan login tidak pernah "nempel".
set_env SANCTUM_STATEFUL_DOMAINS "${VPS_IP},localhost,127.0.0.1"
# SESSION_DOMAIN harus KOSONG untuk akses via IP. Kalau diisi 'localhost',
# browser tidak akan pernah mengirim cookie sesinya ke http://IP_VPS.
set_env SESSION_DOMAIN null
set_env SESSION_SECURE_COOKIE false   # tanpa TLS; ubah ke true kalau nanti pakai HTTPS
ok "APP_URL, Sanctum, dan cookie sesi diarahkan ke ${VPS_IP}"

chown www-data:www-data "$ENV_FILE"; chmod 640 "$ENV_FILE"

# ── 4. Backend ───────────────────────────────────────────────────────────────
step "4/9  Backend (composer + APP_KEY + migrasi)"
cd "$APP_DIR/backend"
say "composer install…"
COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction -q
ok "Dependensi PHP terpasang"

CURRENT_KEY=$(grep -E '^APP_KEY=' "$ENV_FILE" | cut -d= -f2- || echo "")
if [[ -z $CURRENT_KEY ]]; then
  "$PHP_BIN" artisan key:generate --force --no-interaction >/dev/null
  ok "APP_KEY dibuat"
else
  ok "APP_KEY sudah ada — TIDAK diubah"
  say "${Y}Mengganti APP_KEY membuat semua password SSH/DB node tersimpan tidak bisa didekripsi.${N}"
fi

if ask_yn "Jalankan migrasi database sekarang?"; then
  "$PHP_BIN" artisan migrate --force --no-interaction
  ok "Migrasi selesai"
else
  warn "Migrasi dilewati — aplikasi tidak akan jalan sampai ini dijalankan"
fi

install -d -o www-data -g www-data -m 775 storage bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
ok "Izin storage/ dan bootstrap/cache diatur"

# ── 5. Frontend ──────────────────────────────────────────────────────────────
step "5/9  Build frontend"
cd "$APP_DIR/frontend"
if [[ -d node_modules ]] && ! ask_yn "node_modules sudah ada, jalankan npm install lagi?" n; then
  say "npm install dilewati"
else
  npm install --no-fund --no-audit --loglevel=error
fi
npm run build
[[ -f dist/index.html ]] || die "build frontend tidak menghasilkan dist/index.html"
ok "Frontend ter-build"

# ── 6. php-fpm ───────────────────────────────────────────────────────────────
step "6/9  php-fpm"
POOL=/etc/php/${PHP_VER}/fpm/pool.d/www.conf
[[ -f $POOL ]] || die "pool php-fpm tidak ditemukan di $POOL"
CUR_CHILDREN=$(awk -F= '/^pm.max_children/{gsub(/ /,"",$2); print $2}' "$POOL" | head -1)
say "pm.max_children sekarang: ${CUR_CHILDREN:-tidak diset}"
say "nginx.conf mematikan fastcgi_buffering supaya unduhan backup besar tidak"
say "ditulis dulu ke berkas sementara — konsekuensinya satu worker tertahan"
say "selama unduhan berlangsung, jadi pool jangan terlalu kecil."
if ask_yn "Set pm.max_children ke 10?"; then
  sed -i -E 's/^;?\s*pm\.max_children\s*=.*/pm.max_children = 10/' "$POOL"
  ok "pm.max_children = 10"
fi
systemctl enable "$FPM_SVC" >/dev/null 2>&1 || true
systemctl restart "$FPM_SVC"
[[ -S $FPM_SOCK ]] || die "soket php-fpm tidak muncul di $FPM_SOCK"
ok "php-fpm aktif, soket $FPM_SOCK"

# ── 7. Nginx ─────────────────────────────────────────────────────────────────
step "7/9  Nginx"
SITE=/etc/nginx/sites-available/internal-backup-perwira
sed -e "s#/var/www/internal-backup-perwira#${APP_DIR}#g" \
    -e "s#unix:/run/php/php8.1-fpm.sock#unix:${FPM_SOCK}#" \
    "$APP_DIR/deploy/nginx.conf" > "$SITE"
ln -sfn "$SITE" /etc/nginx/sites-enabled/internal-backup-perwira
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  if ask_yn "Nonaktifkan situs 'default' bawaan nginx?"; then
    rm -f /etc/nginx/sites-enabled/default
  fi
fi
nginx -t || die "konfigurasi nginx tidak valid — tidak ada yang di-reload"
systemctl reload nginx
ok "Nginx aktif dengan konfigurasi php-fpm"

# ── 8. Systemd: queue + scheduler ────────────────────────────────────────────
step "8/9  Queue worker & scheduler"
if systemctl list-unit-files 2>/dev/null | grep -q '^backup-api\.service'; then
  warn "Menemukan backup-api.service (artisan serve) dari deploy lama."
  say "Itu server dev PHP: satu request pada satu waktu, dan sekarang digantikan php-fpm."
  if ask_yn "Matikan dan hapus backup-api.service?"; then
    systemctl disable --now backup-api >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/backup-api.service
    ok "backup-api dihapus"
  fi
fi

for unit in backup-queue backup-scheduler; do
  sed -e "s#/var/www/internal-backup-perwira#${APP_DIR}#g" \
      -e "s#/usr/bin/php8.1#${PHP_BIN}#g" \
      "$APP_DIR/deploy/${unit}.service" > "/etc/systemd/system/${unit}.service"
done
# Unit lama dengan nama berkas berbeda, kalau pernah terpasang
rm -f /etc/systemd/system/queue-worker.service /etc/systemd/system/scheduler.service
systemctl daemon-reload
systemctl enable --now backup-queue backup-scheduler >/dev/null
systemctl restart backup-queue backup-scheduler
ok "backup-queue dan backup-scheduler aktif"

# ── 9. Cache konfigurasi (opsional) ──────────────────────────────────────────
step "9/9  Cache konfigurasi Laravel"
cd "$APP_DIR/backend"
if ask_yn "Aktifkan config:cache + route:cache? (lebih cepat, tapi WAJIB diulang tiap .env berubah)" n; then
  "$PHP_BIN" artisan config:cache >/dev/null
  "$PHP_BIN" artisan route:cache >/dev/null
  ok "Cache dibuat — jalankan 'artisan config:clear && artisan route:clear' setelah menyunting .env"
else
  "$PHP_BIN" artisan config:clear >/dev/null 2>&1 || true
  "$PHP_BIN" artisan route:clear  >/dev/null 2>&1 || true
  say "Cache tidak dipakai (perubahan .env langsung terbaca)"
fi

# ── Verifikasi ───────────────────────────────────────────────────────────────
step "Verifikasi"
for s in nginx "$FPM_SVC" backup-queue backup-scheduler mysql; do
  if systemctl is-active --quiet "$s"; then ok "$s aktif"; else warn "$s TIDAK aktif"; fi
done

if RESP=$(curl -fsS --max-time 10 "http://127.0.0.1/api/setup/status" 2>/dev/null); then
  ok "API menjawab: $RESP"
else
  warn "API belum menjawab di /api/setup/status"
  say "Periksa: journalctl -u ${FPM_SVC} -n 50 ; tail -50 $APP_DIR/backend/storage/logs/laravel.log"
fi

if curl -fsS --max-time 10 "http://127.0.0.1/" 2>/dev/null | grep -q '<div id="root"'; then
  ok "SPA tersaji oleh nginx"
else
  warn "Halaman utama tidak seperti yang diharapkan"
fi

cat <<EOF

${G}${B}Selesai.${N}

  Buka:  ${B}http://${VPS_IP}${N}

  Belum ada user? Aplikasi akan mengarahkan ke /setup untuk membuat admin pertama.
  ${Y}Jangan jalankan 'artisan db:seed' di produksi${N} — itu membuat admin/password123.

  Log:
    journalctl -u backup-queue -f
    journalctl -u backup-scheduler -f
    tail -f $APP_DIR/backend/storage/logs/laravel.log

  Catatan: akses lewat HTTP polos tanpa TLS, jadi cookie sesi melintas apa adanya.
  Batasi ke jaringan tepercaya (firewall / VPN) selama belum ada HTTPS.

EOF
