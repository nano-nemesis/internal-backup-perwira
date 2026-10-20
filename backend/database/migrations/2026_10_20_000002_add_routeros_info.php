<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Versi + model RouterOS: yang terkini di node, dan yang berlaku saat tiap backup dibuat.
 * Restore .backup hanya aman ke model + versi yang sama, jadi keduanya harus bisa dibandingkan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->string('routeros_version', 40)->nullable()->after('backup_binary');
            $table->string('routeros_model', 80)->nullable()->after('routeros_version');
            $table->timestamp('routeros_checked_at')->nullable()->after('routeros_model');
        });
        Schema::table('backup_logs', function (Blueprint $table) {
            $table->string('routeros_version', 40)->nullable();
            $table->string('routeros_model', 80)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn(['routeros_version', 'routeros_model', 'routeros_checked_at']);
        });
        Schema::table('backup_logs', function (Blueprint $table) {
            $table->dropColumn(['routeros_version', 'routeros_model']);
        });
    }
};
