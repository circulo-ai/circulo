import { useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { getGhostProps } from "@/lib/ghost";
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
  useUploadTaskManagerProps?: Parameters<typeof useUploadTaskManager>[0];
}

export function FileInput({
  customComponent: CustomComponent = DefaultComponent,
  useUploadTaskManagerProps: {
    onTaskComplete,
    ...otherUseUploadTaskManagerProps
  } = {},
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

  const {
    uploadTasks,
    hasActiveUploads,
    enqueueUploads,
    removeUploadTask,
    cancelUploadTask,
    resetAllUploadTasks,
  } = useUploadTaskManager({
    onTaskComplete: (task) => {
      onTaskComplete?.(task);
      const stablePath = task.path ?? task.url ?? task.downloadUrl;
      if (stablePath && onChange)
        onChange({
          target: { value: stablePath },
        } as ChangeEvent<HTMLInputElement>);
    },
    ...otherUseUploadTaskManagerProps,
  });

  // loading lifecycle: reset everything when value is cleared, mark loading while uploads are active, and stop loading once the image finishes.

  useEffect(() => {
    if (value) setIsLoading(true);
    else {
      setIsDragOver(false);
      setIsLoaded(false);
      setIsLoading(false);
      uploadTasks.map((task) => {
        removeUploadTask(task.id);
        cancelUploadTask(task.id);
      });
      resetAllUploadTasks();
    }
  }, [value]);

  useEffect(() => {
    if (hasActiveUploads) setIsLoading(true);
  }, [hasActiveUploads]);

  useEffect(() => {
    if (isLoaded) setIsLoading(false);
  }, [isLoaded]);

  const reset = useCallback(
    () =>
      onChange?.({
        target: { value: "" },
      } as ChangeEvent<HTMLInputElement>),
    [onChange],
  );

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
    [disabled, enqueueUploads],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const files = event.target.files;
      if (files && files.length > 0) enqueueUploads(files);
    },
    [enqueueUploads],
  );

  return (
    <label
      htmlFor={id}
      className={cn("rounded-full", "size-fit", className)} // TODO get rid of the rounded-full
      onDragOver={handleDropOver}
      onDragLeave={handleDropLeave}
      onDrop={handleDrop}
    >
      <input
        id={id}
        type="file"
        value=""
        onChange={handleChange}
        {...getGhostProps({ isGhost: true })}
        disabled={disabled}
        {...props}
      />
      <CustomComponent
        url={normalizeValue(value)}
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
      className={cn("relative size-32 overflow-hidden rounded-full")}
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
          onError={() => setIsLoaded(true)}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-full border border-input",
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

function normalizeValue(value: FileInputProps["value"]): string | undefined {
  if (typeof value === "string") return value;
  else if (typeof value === "number") return value.toString();
  else if (Array.isArray(value)) return value[0];
  else return undefined;
}
