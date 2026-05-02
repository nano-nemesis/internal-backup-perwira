import { useState, useRef, useEffect } from 'react'
import { Terminal, Send, Trash2 } from 'lucide-react'
import { useRemoteExecute } from '../../hooks/useNodes'

interface RemoteTerminalProps {
  nodeId: string
}

interface Line {
  type: 'input' | 'output' | 'error'
  text: string
  ts: string
}

export function RemoteTerminal({ nodeId }: RemoteTerminalProps) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<Line[]>([
    {
      type: 'output',
      text: 'Remote terminal ready. Type a MikroTik command and press Enter.',
      ts: new Date().toLocaleTimeString('id-ID'),
    },
  ])
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const execute = useRemoteExecute()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const addLine = (type: Line['type'], text: string) => {
    setLines((l) => [
      ...l,
      { type, text, ts: new Date().toLocaleTimeString('id-ID') },
    ])
  }

  const run = async () => {
    const cmd = input.trim()
    if (!cmd) return

    setHistory((h) => [cmd, ...h.slice(0, 49)])
    setHistoryIdx(-1)
    setInput('')
    addLine('input', `> ${cmd}`)

    try {
      const res = await execute.mutateAsync({ nodeId, command: cmd })
      const output = res.data?.output ?? '(no output)'
      addLine('output', output)
    } catch (err: any) {
      addLine('error', err.response?.data?.message ?? 'Error executing command')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      run()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(newIdx)
      setInput(history[newIdx] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(historyIdx - 1, -1)
      setHistoryIdx(newIdx)
      setInput(newIdx === -1 ? '' : history[newIdx])
    }
  }

  return (
    <div className="bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-green-400 ml-1" />
          <span className="text-xs font-mono text-slate-400">Remote Terminal</span>
        </div>
        <button
          onClick={() => setLines([])}
          title="Clear"
          className="p-1 rounded hover:bg-slate-800 text-slate-600 hover:text-slate-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-0.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'input'
                ? 'text-green-400'
                : line.type === 'error'
                ? 'text-red-400'
                : 'text-slate-300'
            }
          >
            <span className="text-slate-600 mr-2">[{line.ts}]</span>
            <span className="whitespace-pre-wrap">{line.text}</span>
          </div>
        ))}
        {execute.isPending && (
          <div className="text-slate-500 animate-pulse">Running...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center border-t border-slate-700 px-3 py-2 bg-slate-900">
        <span className="text-green-400 font-mono text-xs mr-2">$</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-xs font-mono text-slate-200 outline-none placeholder-slate-600"
          placeholder="Enter MikroTik command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button
          onClick={run}
          disabled={execute.isPending || !input.trim()}
          className="p-1 text-slate-500 hover:text-green-400 transition-colors disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
