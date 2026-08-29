#!/usr/bin/env bash
#
# ssh-keys.sh — siapkan SSH keypair untuk tiap kategori node.
#
#   sudo bash deploy/ssh-keys.sh
#
# Aman dijalankan berulang: key yang sudah ada TIDAK pernah ditimpa atau dibuat
# ulang. Menimpa private key berarti semua target yang sudah memasang public key
# lamanya langsung menolak koneksi.
#
# Kenapa satu key per kategori, bukan satu key untuk semuanya:
#
#  1. Tipe key-nya memang beda. Impor user key ed25519 baru didukung RouterOS
#     7.12; RouterOS 6.x menolaknya dengan "unable to load key file (wrong
#     format?)". RSA jalan di ROS 6 maupun 7, jadi kategori mikrotik pakai RSA.
#  2. Batas ledakan. Kalau key MikroTik bocor, server database tidak ikut
#     terbuka — dan sebaliknya.
#  3. Rotasi bisa per kategori tanpa menyentuh perangkat kategori lain.
#
set -Eeuo pipefail

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; C=$'\e[36m'; N=$'\e[0m'
else B=''; G=''; Y=''; C=''; N=''; fi
say()  { printf '    %s\n' "$*"; }
ok()   { printf '    %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$*"; }
head2(){ printf '\n%s==> %s%s\n' "$C$B" "$*" "$N"; }
die()  { printf '\nGAGAL: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "jalankan sebagai root: sudo bash deploy/ssh-keys.sh"

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
KEY_DIR="$APP_DIR/backend/storage/app/ssh"
[[ -d "$APP_DIR/backend" ]] || die "struktur repo tidak dikenali di $APP_DIR"

# User yang menjalankan queue worker — dialah yang membaca private key saat backup.
RUN_USER=www-data
id "$RUN_USER" >/dev/null 2>&1 || die "user $RUN_USER tidak ada"

install -d -o "$RUN_USER" -g "$RUN_USER" -m 700 "$KEY_DIR"

# kategori : nama berkas : tipe : keterangan
CATS=(
  "mikrotik|id_mikrotik|rsa|Router MikroTik (RouterOS)"
  "database|id_database|ed25519|Server database Linux (mysqldump)"
  "virtualizor|id_virtualizor|ed25519|Node Virtualizor (tarik berkas via SCP)"
)

head2 "Menyiapkan key di $KEY_DIR"

for entry in "${CATS[@]}"; do
  IFS='|' read -r cat file type label <<<"$entry"
  priv="$KEY_DIR/$file"

  if [[ -f "$priv" ]]; then
    actual=$(ssh-keygen -l -f "$priv" 2>/dev/null | awk '{print $NF}' | tr -d '()' || echo '?')
    ok "[$cat] $label — sudah ada, TIDAK diubah ($file, tipe ${actual:-?})"
    if [[ $cat == mikrotik && ${actual^^} == ED25519 ]]; then
      warn "Key MikroTik ini bertipe ED25519. RouterOS 6.x dan 7.0–7.11 TIDAK bisa"
      warn "mengimpornya. Kalau armada Anda memuat ROS 6, buat key RSA terpisah:"
      warn "  sudo -u $RUN_USER ssh-keygen -t rsa -b 4096 -N '' -f $KEY_DIR/id_mikrotik_rsa"
    fi
  else
    # Dibuat sebagai root lalu di-chown; skrip ini memang sudah root, dan `sudo`
    # tidak selalu terpasang. Isi key-nya sama saja siapa pun yang membuatnya.
    case $type in
      rsa)     ssh-keygen -q -t rsa -b 4096 -N '' -C "perwira-backup-$cat" -f "$priv" ;;
      ed25519) ssh-keygen -q -t ed25519  -N '' -C "perwira-backup-$cat" -f "$priv" ;;
      *) die "tipe key tidak dikenal: $type" ;;
    esac
    ok "[$cat] $label — key baru dibuat ($file, tipe $type)"
  fi

  chown "$RUN_USER":"$RUN_USER" "$priv" "$priv.pub"
  chmod 600 "$priv"; chmod 644 "$priv.pub"
done

# ── Cara memasang ────────────────────────────────────────────────────────────
mk_pub="$KEY_DIR/id_mikrotik.pub"
db_pub="$KEY_DIR/id_database.pub"
vz_pub="$KEY_DIR/id_virtualizor.pub"

head2 "1. MikroTik — pasang public key"
say "Di aplikasi, isi SSH Key Path node MikroTik dengan:"
printf '\n      %s%s%s\n\n' "$B" "$KEY_DIR/id_mikrotik" "$N"
say "Salin public key ke router, lalu impor dan ikat ke user RouterOS:"
cat <<EOF

      scp $mk_pub admin@HOST_MIKROTIK:id_mikrotik.pub

      # di terminal RouterOS:
      /user add name=backup group=read password=""
      /user ssh-keys import public-key-file=id_mikrotik.pub user=backup

EOF
say "Grup 'read' sudah cukup untuk /export. Tambahkan 'write' hanya kalau"
say "terminal remote di UI mau dipakai."

head2 "2. Server database — pasang public key"
say "SSH Key Path node database:"
printf '\n      %s%s%s\n\n' "$B" "$KEY_DIR/id_database" "$N"
cat <<EOF
      sudo -u $RUN_USER ssh-copy-id -i $db_pub backup_user@HOST_TARGET

      # atau manual, di server TARGET:
      mkdir -p ~/.ssh && chmod 700 ~/.ssh
      echo '$(cat "$db_pub" 2>/dev/null || echo "<isi $db_pub>")' >> ~/.ssh/authorized_keys
      chmod 600 ~/.ssh/authorized_keys

EOF

head2 "3. Node Virtualizor — pasang public key"
say "SSH Key Path node virtualizor_db:"
printf '\n      %s%s%s\n\n' "$B" "$KEY_DIR/id_virtualizor" "$N"
cat <<EOF
      sudo -u $RUN_USER ssh-copy-id -i $vz_pub root@HOST_VIRTUALIZOR

EOF
say "User-nya butuh akses baca ke direktori backup Virtualizor"
say "(bawaannya /var/virtualizor/backup/db)."

head2 "Verifikasi sebelum mengandalkan penjadwal"
cat <<EOF
      sudo -u $RUN_USER ssh -i $KEY_DIR/id_mikrotik    backup@HOST_MIKROTIK '/export'
      sudo -u $RUN_USER ssh -i $KEY_DIR/id_database    backup_user@HOST_TARGET 'mysqldump --version'
      sudo -u $RUN_USER ssh -i $KEY_DIR/id_virtualizor root@HOST_VIRTUALIZOR 'ls /var/virtualizor/backup/db'

EOF
say "Kalau ketiganya lewat, kosongkan field password node dan picu Backup Now."

head2 "Public key (salin dari sini kalau perlu)"
for f in "$mk_pub" "$db_pub" "$vz_pub"; do
  [[ -f $f ]] || continue
  printf '\n  %s%s%s\n  %s\n' "$B" "$(basename "$f")" "$N" "$(cat "$f")"
done
echo
