import { Edit } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FloatingActionButtonProps {
  collapsed: boolean
}

export function FloatingActionButton({ collapsed }: FloatingActionButtonProps) {
  return (
    <div className={`absolute bottom-6 ${collapsed ? "left-1/2 -translate-x-1/2" : "right-6"} transition-all`}>
      <Button size="icon" className="h-14 w-14 rounded-full bg-[#7C3AED] hover:bg-[#6D28D9] shadow-lg">
        <Edit className="h-6 w-6 text-white" />
      </Button>
    </div>
  )
}
