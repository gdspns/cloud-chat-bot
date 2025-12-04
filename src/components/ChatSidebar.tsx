import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Bot, MessageCircle, User, Key, Trash2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BotActivation {
  id: string;
  bot_token: string;
  personal_user_id: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
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
  onDeleteBot: (botId: string) => void;
  onBotUpdated: () => void;
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
  onDeleteBot,
  onBotUpdated,
  unreadChats,
}: ChatSidebarProps) => {
  const { toast } = useToast();
  const [bindingBotId, setBindingBotId] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  
  const botsEndRef = useRef<HTMLDivElement>(null);
  const chatsEndRef = useRef<HTMLDivElement>(null);

  const filteredChats = selectedBotId 
    ? chats.filter(chat => chat.botId === selectedBotId)
    : chats;

  // 自动滚动到底部
  useEffect(() => {
    botsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bots]);

  useEffect(() => {
    chatsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredChats]);

  const handleBindCode = async (botId: string) => {
    if (!activationCode.trim()) {
      toast({
        title: "错误",
        description: "请输入激活码",
        variant: "destructive",
      });
      return;
    }

    setIsBinding(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: { 
          action: 'bind-existing',
          activationCode: activationCode.trim(),
          botId: botId
        }
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      
      toast({
        title: "绑定成功",
        description: "激活码已成功绑定，机器人已激活",
      });
      setActivationCode("");
      setBindingBotId(null);
      onBotUpdated();
    } catch (error: any) {
      toast({
        title: "绑定失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsBinding(false);
    }
  };

  const formatExpireDate = (expireAt: string | null) => {
    if (!expireAt) return '永久';
    const date = new Date(expireAt);
    const now = new Date();
    if (date < now) return '已过期';
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="w-full md:w-80 border-r md:border-b-0 border-b bg-muted/30 flex flex-col h-[450px]">
      {/* 添加机器人按钮 */}
      <div className="p-3 border-b">
        <Button onClick={onAddBot} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          添加机器人
        </Button>
      </div>

      {/* 机器人列表 - 固定高度200px并可滚动 */}
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Bot className="h-3 w-3" />
          我的机器人
        </h3>
        <ScrollArea className="h-[180px]">
          <div className="space-y-2">
            {bots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                暂无机器人，点击上方按钮添加
              </p>
            ) : (
              bots.map((bot) => {
                const hasUnreadInBot = chats.some(
                  chat => chat.botId === bot.id && unreadChats.has(chat.chatId)
                );
                const isExpired = bot.expire_at && new Date(bot.expire_at) < new Date();
                const trialExceeded = !bot.is_authorized && bot.trial_messages_used >= bot.trial_limit;
                
                return (
                  <div key={bot.id} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant={selectedBotId === bot.id ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "flex-1 justify-start text-xs h-8",
                          hasUnreadInBot && "animate-pulse ring-2 ring-primary"
                        )}
                        onClick={() => onSelectBot(bot.id)}
                      >
                        <Bot className="h-3 w-3 mr-1 shrink-0" />
                        <span className="truncate text-[10px]">
                          {bot.bot_token.split(':')[0]}...
                        </span>
                        {!bot.is_authorized && (
                          <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0">
                            试用
                          </Badge>
                        )}
                        {bot.is_active && !isExpired && !trialExceeded && (
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full ml-1 shrink-0" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => onDeleteBot(bot.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    
                    {/* 状态信息 */}
                    <div className="text-[10px] text-muted-foreground px-2 flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span className={isExpired ? 'text-destructive' : ''}>
                        {bot.is_authorized ? `有效期: ${formatExpireDate(bot.expire_at)}` : `试用: ${bot.trial_messages_used}/${bot.trial_limit}`}
                      </span>
                    </div>
                    
                    {/* 绑定激活码 - 未授权的机器人显示 */}
                    {!bot.is_authorized && (
                      <div className="px-1">
                        {bindingBotId === bot.id ? (
                          <div className="flex gap-1">
                            <Input
                              placeholder="输入激活码"
                              value={activationCode}
                              onChange={(e) => setActivationCode(e.target.value)}
                              className="h-6 text-xs flex-1"
                            />
                            <Button 
                              size="sm" 
                              className="h-6 text-xs px-2"
                              onClick={() => handleBindCode(bot.id)}
                              disabled={isBinding}
                            >
                              {isBinding ? '...' : '绑定'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                setBindingBotId(null);
                                setActivationCode("");
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-6 text-xs"
                            onClick={() => setBindingBotId(bot.id)}
                          >
                            <Key className="h-3 w-3 mr-1" />
                            绑定激活码
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={botsEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* 聊天列表 - 固定高度并可滚动 */}
      <div className="flex flex-col min-h-0 flex-1">
        <h3 className="text-xs font-semibold text-muted-foreground p-3 pb-2 flex items-center gap-1">
          <MessageCircle className="h-3 w-3" />
          聊天对话
        </h3>
        <ScrollArea className="flex-1">
          <div className="p-2 pt-0 space-y-1">
            {filteredChats.length === 0 ? (
              <div className="text-center py-4">
                <User className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
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
            <div ref={chatsEndRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ChatSidebar;