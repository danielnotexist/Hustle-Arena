import type { ReactNode } from "react";

export function SidebarItem({
  icon,
  label,
  active,
  onClick,
  highlight,
}: {
  id?: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
  key?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-[16px] border px-4 py-3 text-left transition-all duration-200 ${
        active
          ? "border-cyan-400/45 bg-[linear-gradient(90deg,rgba(34,211,238,0.26),rgba(34,211,238,0.12))] text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.15)]"
          : "border-transparent text-white/90 hover:border-white/10 hover:bg-white/[0.04]"
      } ${highlight ? "text-esport-secondary hover:text-esport-secondary" : ""}`}
    >
      {active && <div className="absolute inset-y-2 right-0 w-[2px] rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />}
      <div className={`shrink-0 transition-colors ${active ? "text-cyan-300" : "text-white/70 group-hover:text-white"}`}>{icon}</div>
      <span className="text-sm font-bold tracking-tight">{label}</span>
      {highlight && <div className="ml-auto h-2 w-2 rounded-full bg-esport-secondary shadow-[0_0_8px_rgba(249,115,22,0.6)]" />}
    </div>
  );
}
