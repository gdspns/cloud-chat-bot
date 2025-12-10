import { Skeleton } from "@/components/ui/skeleton";

export const ChatSidebarSkeleton = () => {
  return (
    <div className="w-full md:w-80 border-r md:border-b-0 border-b bg-muted/30 flex flex-col h-[450px] animate-in fade-in duration-200">
      {/* 添加机器人按钮骨架 */}
      <div className="p-3 border-b">
        <Skeleton className="w-full h-8 rounded-md" />
      </div>

      {/* 机器人列表骨架 */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-1 mb-2">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <Skeleton className="flex-1 h-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="flex items-center gap-2 px-2">
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 聊天列表骨架 */}
      <div className="flex-1 p-3">
        <div className="flex items-center gap-1 mb-2">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-full h-14 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
};

export const ChatWindowSkeleton = () => {
  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-200">
      {/* 头部骨架 */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-12 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-20 rounded" />
        </div>
      </div>

      {/* 消息区域骨架 */}
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[70%] space-y-2 ${i % 2 === 0 ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton 
                className={`h-12 rounded-lg ${
                  i % 3 === 0 ? 'w-48' : i % 3 === 1 ? 'w-64' : 'w-32'
                }`} 
              />
            </div>
          </div>
        ))}
      </div>

      {/* 输入区域骨架 */}
      <div className="p-4 border-t flex gap-2">
        <Skeleton className="h-9 w-9 rounded" />
        <Skeleton className="flex-1 h-9 rounded" />
        <Skeleton className="h-9 w-9 rounded" />
      </div>
    </div>
  );
};

export const MessageListSkeleton = () => {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}
        >
          <div className={`max-w-[70%] space-y-2`}>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton 
              className={`h-12 rounded-lg ${
                i % 3 === 0 ? 'w-48' : i % 3 === 1 ? 'w-64' : 'w-32'
              }`} 
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default { ChatSidebarSkeleton, ChatWindowSkeleton, MessageListSkeleton };
