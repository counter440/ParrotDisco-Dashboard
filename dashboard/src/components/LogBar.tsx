import { Terminal } from "lucide-react";

interface LogBarProps {
  messages: string[];
}

export default function LogBar({ messages }: LogBarProps) {
  const lastMsg = messages[messages.length - 1] ?? "Ready";

  return (
    <div className="flex items-center px-4 gap-2.5 h-10 bg-white/[0.04] backdrop-blur-xl border-t border-white/[0.08] text-xs overflow-hidden">
      <span className="font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-1.5 shrink-0">
        <Terminal size={13} className="text-cyan-400" /> LOG
      </span>
      <span className="text-white/40 truncate">{lastMsg}</span>
    </div>
  );
}
