<?php

namespace App\Services;

use App\Models\Node;
use Spatie\Ssh\Ssh;

/**
 * DatabaseBackupService — Backup MySQL/MariaDB via SSH stdout
 *
 * Permission yang dibutuhkan di target server:
 *
 * 1. User SSH (minimal):
 *    - Bisa login via SSH
 *    - Bisa menjalankan `mysqldump` (harus ada di PATH, biasanya via mysql-client)
 *    - TIDAK perlu sudo atau root
 *
 * 2. User MySQL (minimal):
 *    CREATE USER 'backup_user'@'localhost' IDENTIFIED BY 'password';
 *    GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER ON dbname.* TO 'backup_user'@'localhost';
 *    FLUSH PRIVILEGES;
 *
 * 3. Pastikan mysqldump terinstall di target server:
 *    apt install mysql-client   (Ubuntu/Debian)
 *    yum install mysql          (CentOS/RHEL)
 *
 * Flow backup:
 *   SSH → mysqldump (plain SQL stdout) → capture di VPS backup → gzip lokal → simpan .sql.gz
 *
 * Mengapa tidak pipe ke gzip via SSH?
 *   Output binary dari gzip tidak bisa di-capture via SSH stdout sebagai string — file akan corrupt.
 *   Solusi: capture SQL (text) lalu compress di VPS backup menggunakan PHP native gzip.
 */
class DatabaseBackupService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.sql.gz";

        // basename(): pertahanan berlapis kalau ada nama node lama yang tersimpan
        // sebelum validasi karakter dipasang — '../../etc' jadi 'etc', bukan
        // menulis di luar direktori backup. Nama normal tidak berubah.
        $safeName = basename($node->name);
        $localDir = storage_path("app/backups/database/{$safeName}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$filename}";

        $ssh = $this->buildSsh($node);

        // Plain SQL output — no pipe to gzip so stdout stays as text, safe to capture
        // $node->db_password already decrypted by the model accessor
        // escapeshellarg(), bukan addslashes(): di dalam kutip tunggal shell, \' TIDAK
        // mengescape apa pun — ia menutup kutipnya. Password/nama DB berisi kutip tunggal
        // bisa keluar dari kutip dan menyuntikkan perintah ke server target.
        $dbPass = $node->db_password
            ? ' -p' . escapeshellarg($node->db_password)
            : '';

        $cmd = 'mysqldump --single-transaction --quick --lock-tables=false'
             . ' -u' . escapeshellarg($node->db_user)
             . $dbPass
             . ' ' . escapeshellarg($node->db_name);

        // removeBash() prevents bash-wrapper overhead; command has no shell features
        $process = $ssh->removeBash()->execute($cmd);
        $content = $process->getOutput();

        if (empty(trim($content))) {
            $err = trim($process->getErrorOutput());
            throw new \RuntimeException(
                "mysqldump output kosong dari {$node->host}." .
                ($err ? " Error: {$err}" : " Pastikan credential DB benar dan user memiliki permission SELECT.")
            );
        }

        // Exit code diperiksa terpisah: mysqldump yang mati di tengah jalan (koneksi
        // putus, OOM, lock timeout) tetap sempat menulis header, jadi cek header saja
        // meloloskan dump terpotong sebagai "sukses".
        if (!$process->isSuccessful()) {
            throw new \RuntimeException(
                "mysqldump gagal di {$node->host} (exit code {$process->getExitCode()}): "
                . trim($process->getErrorOutput())
            );
        }

        // Sanity-check: output harus berisi header mysqldump yang dikenal
        if (!str_contains($content, '-- MySQL dump') && !str_contains($content, '-- MariaDB dump')) {
            $err = trim($process->getErrorOutput());
            throw new \RuntimeException(
                "Output bukan SQL dump yang valid dari {$node->host}." .
                ($err ? " Error: {$err}" : " Cek credential dan nama database.")
            );
        }

        // Penanda penutup: mysqldump hanya menulis ini setelah SELURUH dump selesai.
        // Tanpa cek ini, dump yang terpotong di tengah INSERT tetap lolos jadi backup.
        if (!str_contains($content, '-- Dump completed')) {
            throw new \RuntimeException(
                "Dump dari {$node->host} tidak lengkap — penanda '-- Dump completed' tidak ditemukan. "
                . "Kemungkinan koneksi terputus atau mysqldump dihentikan di tengah jalan."
            );
        }

        // Compress menggunakan PHP native gzip — tidak butuh binary gzip di VPS
        $gz = gzopen($localPath, 'wb9');
        if ($gz === false) {
            throw new \RuntimeException("Gagal membuka file gzip untuk ditulis: {$localPath}");
        }
        gzwrite($gz, $content);
        gzclose($gz);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException(
                "Gagal membuat file backup database untuk {$node->db_name}@{$node->host}"
            );
        }

        return $localPath;
    }

    private function buildSsh(Node $node): Ssh
    {
        // Database dump butuh lebih banyak waktu dari MikroTik /export
        $timeout = config('backup.ssh_timeout', 120);

        $ssh = Ssh::create($node->ssh_user, $node->host, $node->port ?? 22)
            ->disableStrictHostKeyChecking()
            ->setTimeout($timeout);

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            return $ssh->usePrivateKey($node->ssh_key_path);
        }

        // $node->ssh_password already decrypted by the model accessor
        return $ssh->usePassword($node->ssh_password ?? '');
    }
}
