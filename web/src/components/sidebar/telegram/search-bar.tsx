import { Search, Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function SearchBar() {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center flex-1 bg-accent/50 rounded-lg px-3 py-1.5">
        <Search className="h-4 w-4 text-muted-foreground mr-2" />
        <Input
          placeholder="Search"
          className="border-0 bg-transparent p-0 h-6 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-[#7C3AED] hover:bg-transparent"
      >
        <Star className="h-5 w-5 fill-[#7C3AED] stroke-[#7C3AED]" />
      </Button>
    </div>
  )
}
