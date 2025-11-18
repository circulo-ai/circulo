import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ConversationAvatarProps {
  src: string;
  alt: string;
  fallback: string;
  className?: string;
}

export function ConversationAvatar({
  src,
  alt,
  fallback,
  className = "",
}: ConversationAvatarProps) {
  return (
    <Avatar className={`h-12 w-12 rounded-xl ${className}`}>
      <AvatarImage src={src || "/placeholder.svg"} alt={alt} />
      <AvatarFallback className="rounded-xl text-sm font-medium">
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
