import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export function ChatSidebarNoResult() {
  return (
    <div className="mt-6 text-center">
      <div className="text-lg font-medium">No Results</div>
      <div className="mb-6 text-sm/relaxed text-muted-foreground">
        Try a different search term
      </div>
      <DotLottieReact src="duck.lottie" loop autoplay />
    </div>
  );
}
