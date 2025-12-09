import { useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, AlertTriangle, Volume2, VolumeX, Bot, ShoppingCart, WifiOff, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Message {
  id: string;
  telegram_chat_id: number;
  telegram_user_name: string;
  content: string;
  direction: string;
  created_at: string;
  is_admin_reply?: boolean;
}

interface BotActivation {
  id: string;
  bot_token: string;
  is_active: boolean;
  is_authorized: boolean;
  trial_messages_used: number;
  trial_limit: number;
  expire_at: string | null;
  web_enabled: boolean;
  app_enabled: boolean;
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
    
    if (selectedBot && !selectedBot.is_authorized && selectedBot.trial_messages_used >= selectedBot.trial_limit) {
      setShowTrialDialog(true);
      return;
    }
    
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
  const trialExceeded = selectedBot && !selectedBot.is_authorized && selectedBot.trial_messages_used >= selectedBot.trial_limit;
  const webDisabled = selectedBot && !selectedBot.web_enabled;
  const canSend = selectedBot?.is_active && !isExpired && !trialExceeded && selectedChatId && !webDisabled;

  // 检测消息是否包含图片
  const renderMessageContent = (content: string) => {
    // 检查是否是图片消息
    if (content.includes('[图片]')) {
      const urlMatch = content.match(/(https:\/\/api\.telegram\.org\/file\/[^\s]+)/);
      if (urlMatch) {
        const caption = content.replace('[图片]', '').replace(urlMatch[0], '').trim();
        return (
          <div className="space-y-2">
            <img 
              src={urlMatch[0]} 
              alt="图片" 
              className="max-w-full rounded-lg max-h-48 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {caption && <p className="text-sm">{caption}</p>}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-sm">
          <Image className="h-4 w-4" />
          <span>{content.replace('[图片]', '').trim() || '图片消息'}</span>
        </div>
      );
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{content}</p>;
  };

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

  // Web端口关闭状态
  if (webDisabled) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">控制台</span>
            <span className="px-2 py-0.5 rounded text-xs bg-destructive/20 text-destructive">
              Web端口已关闭
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onToggleSound}>
              {enableSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <WifiOff className="h-16 w-16 mx-auto text-destructive/30 mb-4" />
            <h3 className="text-lg font-medium text-destructive">Web端口已关闭</h3>
            <p className="text-sm text-muted-foreground mt-2">
              管理员已关闭此机器人的Web端口，暂时无法查看和发送消息
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              请联系管理员开启Web端口
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 无选中聊天状态
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">控制台</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              selectedBot.is_active && !isExpired && !trialExceeded
                ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
                : 'bg-red-500/20 text-red-700 dark:text-red-300'
            }`}>
              {selectedBot.is_active && !isExpired && !trialExceeded ? '在线' : '离线'}
            </span>
            {!selectedBot.is_authorized && (
              <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                试用: {selectedBot.trial_messages_used}/{selectedBot.trial_limit}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onToggleSound}>
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
    <div className="flex-1 flex flex-col h-full md:h-auto overflow-hidden">
      {/* 头部 */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {filteredMessages[0]?.telegram_user_name || '聊天'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs ${
            selectedBot.is_active && !isExpired && !trialExceeded
              ? 'bg-green-500/20 text-green-700 dark:text-green-300' 
              : 'bg-red-500/20 text-red-700 dark:text-red-300'
          }`}>
            {selectedBot.is_active && !isExpired && !trialExceeded ? '在线' : '离线'}
          </span>
          {!selectedBot.is_authorized && (
            <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
              试用: {selectedBot.trial_messages_used}/{selectedBot.trial_limit}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleSound}>
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

      {/* 消息列表 */}
      <div className="flex-1 flex justify-center">
        <ScrollArea className="p-4 h-[300px] w-full max-w-[400px] overflow-y-auto">
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
                <span className="font-medium text-sm">
                  {message.telegram_user_name}
                  {message.is_admin_reply && ' (管理员)'}
                </span>
                <span className="text-xs opacity-70 ml-2">
                  {new Date(message.created_at).toLocaleTimeString('zh-CN')}
                </span>
              </div>
              {renderMessageContent(message.content)}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </ScrollArea>
      </div>

      {/* 状态提示 */}
      {(trialExceeded || !selectedBot.is_active || isExpired) && (
        <div className="mx-4 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {trialExceeded 
              ? "试用次数已用完，请绑定激活码继续使用" 
              : isExpired 
                ? "服务已过期，请联系管理员续期" 
                : "服务已停止，无法发送消息"}
          </p>
        </div>
      )}

      {/* 发送消息 */}
      <div className="p-3 md:p-4 border-t flex gap-2 bg-background sticky bottom-0 left-0 right-0 w-full">
        <Input
          placeholder="输入回复消息..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={!canSend}
          className="flex-1 min-w-0"
        />
        <Button 
          onClick={handleSend} 
          disabled={!canSend || isSending}
          size="sm"
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* 试用限制对话框 */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              需要购买授权
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>您已使用完 {selectedBot.trial_limit} 条免费试用消息。</p>
              <p>如需继续使用，请联系管理员获取激活码授权。</p>
              <p className="text-primary font-medium">绑定激活码后即可继续使用机器人服务。</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTrialDialog(false)}>
              稍后再说
            </Button>
            <Button onClick={() => setShowTrialDialog(false)}>
              去绑定激活码
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatWindow;
