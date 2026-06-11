import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

/**
 * Text skeleton - mimics lines of text
 */
function SkeletonText({
  lines = 1,
  className,
  lastLineWidth = "60%",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? lastLineWidth : "100%" }}
        />
      ))}
    </div>
  );
}

/**
 * Avatar skeleton
 */
function SkeletonAvatar({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  }[size];

  return <Skeleton className={cn(sizeClass, "rounded-full", className)} />;
}

/**
 * Card skeleton - for document/task cards
 */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar size="sm" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <SkeletonText lines={2} />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-15 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Document list skeleton
 */
function SkeletonDocumentList({ count = 5 }: { count?: number }) {
  const widths = [72, 88, 64, 80, 76];

  return (
    <div className="space-y-2" data-testid="docs-loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-6 w-6 rounded-sm" />
          <div className="flex-1">
            <Skeleton className="h-4" style={{ width: `${widths[i % widths.length]}%` }} />
          </div>
          <Skeleton className="h-3 w-15" />
        </div>
      ))}
    </div>
  );
}

/**
 * Task board skeleton
 */
function SkeletonTaskBoard() {
  return (
    <div className="flex gap-4" data-testid="tasks-loading">
      {["todo", "in-progress", "done"].map((column, columnIndex) => (
        <div key={column} className="flex-1 space-y-3">
          <Skeleton className="h-6 w-25 mb-4" />
          {Array.from({ length: 2 + (columnIndex % 3) }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Chat message skeleton
 */
function SkeletonChatMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <SkeletonAvatar size="sm" />
      <div
        className={cn(
          "max-w-[70%] space-y-2 rounded-lg p-3",
          isUser ? "bg-primary/10" : "bg-muted"
        )}
      >
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

/**
 * Agent execution list skeleton
 */
function SkeletonAgentExecution() {
  return (
    <div className="space-y-4" data-testid="executions-loading">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-30" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-6 w-18 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-25" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonDocumentList,
  SkeletonTaskBoard,
  SkeletonChatMessage,
  SkeletonAgentExecution,
}
