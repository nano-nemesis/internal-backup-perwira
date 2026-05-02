<?php

namespace App\Http\Controllers;

use App\Models\Node;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BackupFilesController extends Controller
{
    public function index(Request $request)
    {
        $nodeId  = $request->query('node_id');
        $type    = $request->query('type');
        $perPage = max(1, (int) $request->query('per_page', 20));
        $page    = max(1, (int) $request->query('page', 1));

        $nodes = Node::all()->keyBy('name');
        $files = [];

        $dirs = $type ? [$type] : ['mikrotik', 'database'];

        foreach ($dirs as $dir) {
            $basePath = "backups/{$dir}";
            if (!Storage::exists($basePath)) {
                continue;
            }

            foreach (Storage::directories($basePath) as $nodeDir) {
                $nodeName = basename($nodeDir);
                $node = $nodes->get($nodeName);

                if ($nodeId && (!$node || $node->id !== $nodeId)) {
                    continue;
                }

                foreach (Storage::files($nodeDir) as $filePath) {
                    $filename = basename($filePath);
                    $size     = Storage::size($filePath);
                    $mtime    = Storage::lastModified($filePath);

                    $files[] = [
                        'node_id'      => $node?->id,
                        'node_name'    => $nodeName,
                        'type'         => $dir,
                        'filename'     => $filename,
                        'size'         => $size,
                        'size_human'   => $this->formatBytes($size),
                        'created_at'   => date('c', $mtime),
                        'download_url' => "/api/backup-files/download?path={$dir}/{$nodeName}/{$filename}",
                    ];
                }
            }
        }

        usort($files, fn ($a, $b) => strcmp($b['created_at'], $a['created_at']));

        $total    = count($files);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page     = min($page, $lastPage);
        $offset   = ($page - 1) * $perPage;

        return response()->json([
            'data' => array_values(array_slice($files, $offset, $perPage)),
            'meta' => [
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => $lastPage,
            ],
        ]);
    }

    public function download(Request $request)
    {
        $path = $request->query('path', '');

        if (str_contains($path, '..') || str_contains($path, "\0")) {
            abort(400, 'Invalid path');
        }

        $storagePath = "backups/{$path}";

        if (!Storage::exists($storagePath)) {
            abort(404, 'File not found');
        }

        return Storage::download($storagePath);
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1_073_741_824) return round($bytes / 1_073_741_824, 2) . ' GB';
        if ($bytes >= 1_048_576)     return round($bytes / 1_048_576, 2) . ' MB';
        if ($bytes >= 1_024)         return round($bytes / 1_024, 2) . ' KB';
        return $bytes . ' B';
    }
}
