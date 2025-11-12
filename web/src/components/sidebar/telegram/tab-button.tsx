"use client"

import { BadgePill } from "./badge-pill"

interface TabButtonProps {
  label: string
  count?: number
  active?: boolean
  onClick?: () => void
}

export function TabButton({ label, count, active = false, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors relative ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count !== undefined && <BadgePill count={count} variant={active ? "primary" : "muted"} />}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C3AED]" />}
    </button>
  )
}
