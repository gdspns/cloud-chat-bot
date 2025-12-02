import { useRef, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, AlertTriangle, Volume2, VolumeX, Bot } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Message {
  id: string;
  telegram_chat_id: number;
  telegram_user_name: string;
  content: string;
  direction: string;
  created_at: string;
}

interface BotActivation {
  id: string;
  bot_token: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
}

interface ChatWindowProps {
  selectedBot: BotActivation | null;
  selectedChatId: number | null;
  messages: Message[];
  onSendMessage: (message: string) => Promise<{ trialExceeded?: boolean; error?: string }>;
  enableSound: boolean;
  onToggleSound: () => void;
  soundType: string;
  onSoundTypeChange: (type: string) => void;
  onTestSound: () => void;
}

export const ChatWindow = ({
  selectedBot,
  selectedChatId,
  messages,
  onSendMessage,
  enableSound,
  onToggleSound,
  soundType,
  onSoundTypeChange,
  onTestSound,
}: ChatWindowProps) => {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    
    setIsSending(true);
    const result = await onSendMessage(replyText);
    setIsSending(false);
    
    if (result.trialExceeded) {
      setShowTrialDialog(true);
    } else if (!result.error) {
      setReplyText("");
    }
  };

  const filteredMessages = messages.filter(m => m.telegram_chat_id === selectedChatId);
  const isExpired = selectedBot?.expire_at && new Date(selectedBot.expire_at) < new Date();
  const canSend = selectedBot?.is_active && !isExpired && selectedChatId;

  // 无机器人状态
  if (!selectedBot) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <Bot className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">欢迎使用 Telegram 机器人管理平台</h3>
          <p className="text-sm text-muted-foreground mt-2">
            点击左侧"添加机器人"按钮开始试用
          </p>
        </div>
      </div>
    );
  }

  // 无选中聊天状态
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">控制台</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              selectedBot.is_active && !isExpired 
                ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                : 'bg-red-500/20 text-red-700 dark:text-red-300'
            }`}>
              {selectedBot.is_active && !isExpired ? '在线' : '离线'}
            </span>
            {!selectedBot.is_authorized && (
              <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                试用: {selectedBot.trial_messages_used}/{selectedBot.trial_limit}
              </span>
            )}
          </div>
          
          {/* 提示音设置 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSound}
            >
              {enableSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            {enableSound && (
              <>
                <Select value={soundType} onValueChange={onSoundTypeChange}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qq">QQ音</SelectItem>
                    <SelectItem value="ding">叮咚</SelectItem>
                    <SelectItem value="bell">铃铛</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={onTestSound}>
                  测试
                </Button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>请从左侧选择一个聊天对话</p>
            <p className="text-sm mt-1">或等待用户发送消息</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 头部 */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {filteredMessages[0]?.telegram_user_name || '聊天'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${
            selectedBot.is_active && !isExpired 
              ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
              : 'bg-red-500/20 text-red-700 dark:text-red-300'
          }`}>
            {selectedBot.is_active && !isExpired ? '在线' : '离线'}
          </span>
          {!selectedBot.is_authorized && (
            <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
              试用: {selectedBot.trial_messages_used}/{selectedBot.trial_limit}
            </span>
          )}
        </div>
        
        {/* 提示音设置 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSound}
          >
            {enableSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          {enableSound && (
            <>
              <Select value={soundType} onValueChange={onSoundTypeChange}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qq">QQ音</SelectItem>
                  <SelectItem value="ding">叮咚</SelectItem>
                  <SelectItem value="bell">铃铛</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={onTestSound}>
                测试
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 消息列表 - 固定尺寸 12cm x 20cm (约450px x 750px) */}
      <ScrollArea className="p-4 h-[450px] w-full max-w-[750px] mx-auto overflow-y-auto">
        {filteredMessages.map((message) => (
          <div
            key={message.id}
            className={`mb-3 p-3 rounded-lg max-w-[80%] md:max-w-[70%] ${
              message.direction === 'outgoing'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm">{message.telegram_user_name}</span>
              <span className="text-xs opacity-70 ml-2">
                {new Date(message.created_at).toLocaleTimeString('zh-CN')}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* 状态提示 */}
      {(!selectedBot.is_active || isExpired) && (
        <div className="mx-4 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {isExpired ? "服务已过期，请联系管理员续期" : "服务已停止，无法发送消息"}
          </p>
        </div>
      )}

      {/* 发送消息 */}
      <div className="p-4 border-t flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="输入回复消息..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!canSend}
          className="flex-1"
        />
        <Button 
          onClick={handleSend} 
          disabled={!canSend || isSending}
          className="w-full sm:w-auto"
        >
          <Send className="h-4 w-4 mr-1" />
          {isSending ? "..." : "发送"}
        </Button>
      </div>

      {/* 试用限制对话框 */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>试用次数已用完</DialogTitle>
            <DialogDescription>
              您已使用完 {selectedBot.trial_limit} 条免费试用消息。
              如需继续使用，请联系管理员获取激活码授权。
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowTrialDialog(false)}>
            我知道了
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatWindow;
