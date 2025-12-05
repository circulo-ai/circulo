import { UploadTask, useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { cn } from "@/lib/utils";
import { ImageMinus, ImagePlus } from "lucide-react";
import Image from "next/image";
import {
  ChangeEvent,
  ChangeEventHandler,
  ComponentProps,
  Dispatch,
  DragEventHandler,
  FC,
  SetStateAction,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Spinner } from "../ui/spinner";

interface CustomComponentProps {
  url: string | undefined;
  isDragOver: boolean;
  disabled: boolean | undefined;
  isLoading: boolean;
  isLoaded: boolean;
  setIsLoaded: Dispatch<SetStateAction<boolean>>;
  reset: () => void;
}

interface FileInputProps extends ComponentProps<"input"> {
  customComponent?: FC<CustomComponentProps>;
}

export function FileInput({
  customComponent: CustomComponent = DefaultComponent,
  onChange,
  value,
  className,
  disabled,
  id: explicitId,
  ...props
}: FileInputProps) {
  const implicitId = useId();
  const id = explicitId ?? implicitId;
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { uploadTasks, hasActiveUploads, enqueueUploads, resetAllUploadTasks } =
    useUploadTaskManager({
      onTaskComplete: (task) => {
        if (task.url && onChange)
          onChange({
            target: { value: task.url },
          } as ChangeEvent<HTMLInputElement>);
      },
    });

  useEffect(() => {
    if (hasActiveUploads) setIsLoading(true);
    else if (isLoaded) setIsLoading(false);
  }, [hasActiveUploads, isLoaded]);

  const lastTask: UploadTask | undefined = useMemo(
    () => uploadTasks[uploadTasks.length - 1],
    [uploadTasks],
  );

  const reset = useCallback(() => {
    setIsLoaded(false);
    setIsLoading(false);
    // TODO reset the controlled state too
    resetAllUploadTasks();
  }, []);

  const handleDropOver: DragEventHandler<HTMLLabelElement> = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(true);
    },
    [],
  );

  const handleDropLeave: DragEventHandler<HTMLLabelElement> =
    useCallback(() => {
      setIsDragOver(false);
    }, []);

  const handleDrop: DragEventHandler<HTMLLabelElement> = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragOver(false);
      const files = event.dataTransfer.files;
      if (!disabled && files.length > 0) enqueueUploads(files);
    },
    [],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const files = event.target.files;
      if (files && files.length > 0) enqueueUploads(files);
    },
    [],
  );

  return (
    <label
      htmlFor={id}
      className={className}
      onDragOver={handleDropOver}
      onDragLeave={handleDropLeave}
      onDrop={handleDrop}
    >
      <input
        id={id}
        type="file"
        value=""
        onChange={handleChange}
        className="pointer-events-none absolute opacity-0"
        disabled={disabled}
        {...props}
      />
      <CustomComponent
        url={lastTask?.url}
        isDragOver={isDragOver}
        disabled={disabled}
        isLoading={isLoading}
        isLoaded={isLoaded}
        setIsLoaded={setIsLoaded}
        reset={reset}
      />
    </label>
  );
}

function DefaultComponent({
  url,
  isDragOver,
  disabled,
  isLoading,
  isLoaded,
  setIsLoaded,
  reset,
}: CustomComponentProps) {
  return (
    <div
      className={cn(
        "mx-auto",
        "relative size-32 overflow-hidden rounded-full border border-input",
      )}
      onClick={(e) => {
        if (url) {
          e.preventDefault();
          reset();
        }
      }}
    >
      {url && (
        <Image
          src={url}
          alt=""
          width={128}
          height={128}
          className="size-full object-cover"
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(true)} // TODO handle error
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          isLoaded && "bg-background/50",
          !isLoaded && "bg-input/30",
        )}
      >
        {isLoading && <Spinner className="size-8" />}
        {!isLoading && url && <ImageMinus className="size-8" />}
        {!isLoading && !url && <ImagePlus className="size-8" />}
      </div>
    </div>
  );
}

// TODO global drag and drop
