import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Bot, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
}

interface ChatItem {
  chatId: number;
  userName: string;
  lastMessage: string;
  lastTime: string;
  unread: boolean;
  botId: string;
}

interface ChatSidebarProps {
  bots: BotActivation[];
  chats: ChatItem[];
  selectedBotId: string | null;
  selectedChatId: number | null;
  onSelectBot: (botId: string) => void;
  onSelectChat: (chatId: number) => void;
  onAddBot: () => void;
  unreadChats: Set<number>;
}

export const ChatSidebar = ({
  bots,
  chats,
  selectedBotId,
  selectedChatId,
  onSelectBot,
  onSelectChat,
  onAddBot,
  unreadChats,
}: ChatSidebarProps) => {
  const filteredChats = selectedBotId 
    ? chats.filter(chat => chat.botId === selectedBotId)
    : chats;

  return (
    <div className="w-72 border-r bg-muted/30 flex flex-col h-full">
      {/* 添加机器人按钮 */}
      <div className="p-3 border-b">
        <Button onClick={onAddBot} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          添加机器人
        </Button>
      </div>

      {/* 机器人列表 */}
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Bot className="h-3 w-3" />
          我的机器人
        </h3>
        <ScrollArea className="h-24">
          <div className="space-y-1">
            {bots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                暂无机器人，点击上方按钮添加
              </p>
            ) : (
              bots.map((bot) => (
                <Button
                  key={bot.id}
                  variant={selectedBotId === bot.id ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                  onClick={() => onSelectBot(bot.id)}
                >
                  <Bot className="h-3 w-3 mr-2 shrink-0" />
                  <span className="truncate">
                    {bot.bot_token.split(':')[0]}...
                  </span>
                  {!bot.is_authorized && (
                    <Badge variant="outline" className="ml-auto text-[10px] px-1">
                      试用
                    </Badge>
                  )}
                  {bot.is_active && (
                    <span className="w-2 h-2 bg-green-500 rounded-full ml-1 shrink-0" />
                  )}
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 聊天列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        <h3 className="text-xs font-semibold text-muted-foreground p-3 pb-2 flex items-center gap-1">
          <MessageCircle className="h-3 w-3" />
          聊天对话
        </h3>
        <ScrollArea className="flex-1">
          <div className="p-2 pt-0 space-y-1">
            {filteredChats.length === 0 ? (
              <div className="text-center py-8">
                <User className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {selectedBotId ? "等待用户发送消息..." : "请先选择一个机器人"}
                </p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <Button
                  key={`${chat.botId}-${chat.chatId}`}
                  variant={selectedChatId === chat.chatId ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start h-auto py-2 px-3",
                    unreadChats.has(chat.chatId) && "animate-pulse ring-2 ring-primary"
                  )}
                  onClick={() => onSelectChat(chat.chatId)}
                >
                  <div className="flex flex-col items-start w-full min-w-0">
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium text-sm truncate">
                        {chat.userName}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {chat.lastTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between w-full mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {chat.lastMessage}
                      </span>
                      {unreadChats.has(chat.chatId) && (
                        <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 ml-2" />
                      )}
                    </div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ChatSidebar;
