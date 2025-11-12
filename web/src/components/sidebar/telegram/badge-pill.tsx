interface BadgePillProps {
  count: number
  variant?: "primary" | "muted"
}

export function BadgePill({ count, variant = "primary" }: BadgePillProps) {
  const bgColor = variant === "primary" ? "bg-[#7C3AED]" : "bg-muted"
  const textColor = variant === "primary" ? "text-white" : "text-foreground"

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${bgColor} ${textColor} min-w-[2rem] h-5`}
    >
      {count}
    </span>
  )
}
