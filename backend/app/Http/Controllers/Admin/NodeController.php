<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Node;
use App\Models\NodeSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NodeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Node::with('schedule')->get()->map(fn (Node $n) => [
                'id' => $n->id,
                'name' => $n->name,
                'type' => $n->type,
                'host' => $n->host,
                'port' => $n->port,
                'ssh_user' => $n->ssh_user,
                'ssh_key_path' => $n->ssh_key_path,
                'db_name' => $n->db_name,
                'db_user' => $n->db_user,
                'schedule_interval_hours' => $n->schedule_interval_hours,
                'is_active' => $n->is_active,
                'last_backup_at' => $n->last_backup_at,
                'schedule' => $n->schedule,
                'created_at' => $n->created_at,
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'type' => 'required|in:mikrotik,database',
            'host' => 'required|string|max:255',
            'port' => 'nullable|integer|min:1|max:65535',
            'ssh_user' => 'nullable|string|max:100',
            'ssh_password' => 'nullable|string',
            'ssh_key_path' => 'nullable|string|max:500',
            'db_name' => 'nullable|string|max:100',
            'db_user' => 'nullable|string|max:100',
            'db_password' => 'nullable|string',
            'schedule_interval_hours' => 'nullable|integer|min:1|max:8760',
        ]);

        $node = Node::create($validated);

        NodeSchedule::create([
            'node_id' => $node->id,
            'next_run_at' => now()->addHours($node->schedule_interval_hours),
            'interval_hours' => $node->schedule_interval_hours,
        ]);

        return response()->json(['data' => $node, 'message' => 'Node created successfully'], 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(['data' => Node::with('schedule')->findOrFail($id)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'type' => 'sometimes|in:mikrotik,database',
            'host' => 'sometimes|string|max:255',
            'port' => 'nullable|integer|min:1|max:65535',
            'ssh_user' => 'nullable|string|max:100',
            'ssh_password' => 'nullable|string',
            'ssh_key_path' => 'nullable|string|max:500',
            'db_name' => 'nullable|string|max:100',
            'db_user' => 'nullable|string|max:100',
            'db_password' => 'nullable|string',
            'schedule_interval_hours' => 'nullable|integer|min:1|max:8760',
        ]);

        // Only update password if provided
        if (isset($validated['ssh_password']) && $validated['ssh_password'] === '') {
            unset($validated['ssh_password']);
        }
        if (isset($validated['db_password']) && $validated['db_password'] === '') {
            unset($validated['db_password']);
        }

        $node->update($validated);

        if (isset($validated['schedule_interval_hours'])) {
            NodeSchedule::updateOrCreate(
                ['node_id' => $node->id],
                ['interval_hours' => $validated['schedule_interval_hours']]
            );
        }

        return response()->json(['data' => $node, 'message' => 'Node updated successfully']);
    }

    public function destroy(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        $node->delete();
        return response()->json(['message' => 'Node deleted successfully']);
    }

    public function toggle(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        $node->update(['is_active' => !$node->is_active]);
        $status = $node->is_active ? 'activated' : 'deactivated';
        return response()->json(['data' => $node, 'message' => "Node {$status}"]);
    }
}
