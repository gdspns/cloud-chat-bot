import { useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, AlertTriangle, Volume2, VolumeX, Bot, ShoppingCart, Image, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { BotActivation, Message } from "@/types/bot";

interface ChatWindowProps {
  selectedBot: BotActivation | null;
  selectedChatId: number | null;
  messages: Message[];
  onSendMessage: (message: string, photoBase64?: string) => Promise<{ trialExceeded?: boolean; error?: string }>;
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    // 只滚动消息框内部，不滚动整个页面
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!replyText.trim() && !selectedImage) return;
    
    if (selectedBot && !selectedBot.is_authorized && selectedBot.trial_messages_used >= selectedBot.trial_limit) {
      setShowTrialDialog(true);
      return;
    }
    
    setIsSending(true);
    const result = await onSendMessage(replyText, selectedImage || undefined);
    setIsSending(false);
    
    if (result.trialExceeded) {
      setShowTrialDialog(true);
    } else if (!result.error) {
      setReplyText("");
      setSelectedImage(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // 清空input，允许再次选择同一文件
    e.target.value = '';
  };

  const processImageFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 处理粘贴事件
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  };

  const filteredMessages = messages.filter(m => m.telegram_chat_id === selectedChatId);
  const isExpired = selectedBot?.expire_at && new Date(selectedBot.expire_at) < new Date();
  const trialExceeded = selectedBot && !selectedBot.is_authorized && selectedBot.trial_messages_used >= selectedBot.trial_limit;
  const webDisabled = selectedBot && !selectedBot.web_enabled;
  const canSend = selectedBot?.is_active && !isExpired && !trialExceeded && selectedChatId && !webDisabled;

  // 构建图片代理URL
  const getProxyImageUrl = (telegramUrl: string) => {
    if (!selectedBot) return '';
    const encodedUrl = encodeURIComponent(telegramUrl);
    return `https://ibyscmelievcbkhtshcn.supabase.co/functions/v1/get-telegram-image?url=${encodedUrl}&botId=${selectedBot.id}`;
  };

  // 检测消息是否包含图片
  const renderMessageContent = (content: string) => {
    // 检查是否是图片消息
    if (content.includes('[图片]')) {
      const urlMatch = content.match(/(https:\/\/api\.telegram\.org\/file\/[^\s]+)/);
      if (urlMatch && selectedBot) {
        const caption = content.replace('[图片]', '').replace(urlMatch[0], '').trim();
        const proxyUrl = getProxyImageUrl(urlMatch[0]);
        return (
          <div className="space-y-2">
            <img 
              src={proxyUrl} 
              alt="图片" 
              className="max-w-full rounded-lg max-h-48 object-contain cursor-pointer"
              onClick={() => window.open(proxyUrl, '_blank')}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                console.error('Image load failed:', proxyUrl);
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

  // Web端口关闭状态 - 不显示提示，直接返回空聊天界面
  if (webDisabled) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">控制台</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onToggleSound}>
              {enableSound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
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
      <div className="flex-1 flex justify-center overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="p-4 h-[300px] w-full max-w-[400px]">
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

      {/* 图片预览 */}
      {selectedImage && (
        <div className="mx-4 mb-2 relative inline-block">
          <img src={selectedImage} alt="预览" className="max-h-24 rounded-lg" />
          <button 
            onClick={() => setSelectedImage(null)}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* 发送消息 */}
      <div className="p-3 md:p-4 border-t flex gap-2 bg-background sticky bottom-0 left-0 right-0 w-full">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageSelect}
          className="hidden"
        />
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canSend}
          className="shrink-0"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Input
          placeholder="输入回复消息...（可粘贴图片）"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          onPaste={handlePaste}
          disabled={!canSend}
          className="flex-1 min-w-0"
        />
        <Button 
          onClick={handleSend} 
          disabled={!canSend || isSending || (!replyText.trim() && !selectedImage)}
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
