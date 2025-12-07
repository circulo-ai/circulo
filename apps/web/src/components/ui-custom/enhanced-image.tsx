import { getGhostProps } from "@/lib/ghost";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import {
  ComponentProps,
  ReactEventHandler,
  useCallback,
  useState,
} from "react";
import { Spinner } from "../ui/spinner"; // TODO prevent relative imports

interface EnhancedImageProps extends ComponentProps<typeof Image> {}

export function EnhancedImage({
  onLoad,
  onError,
  className,
  ...props
}: EnhancedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const handleLoad: ReactEventHandler<HTMLImageElement> = useCallback(
    (event) => {
      onLoad?.(event);
      setIsLoading(false);
    },
    [onLoad],
  );

  const handleError: ReactEventHandler<HTMLImageElement> = useCallback(
    (event) => {
      onError?.(event);
      setIsError(true);
    },
    [onError],
  );

  return (
    <>
      <Image
        onLoad={handleLoad}
        onError={handleError}
        {...getGhostProps({ isGhost: isLoading || isError, className })}
        {...props}
      />

      <Spinner {...getGhostProps({ isGhost: !isLoading })} />

      <ImageOff {...getGhostProps({ isGhost: !isError })} />
    </>
  );
}

// TODO a div wrapper with the same width and height
// TODO make its states controllable so it can be used in the file input component
// TODO use data-state
