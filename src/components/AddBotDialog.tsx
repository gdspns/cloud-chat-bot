import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Plus } from "lucide-react";

interface AddBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBotAdded: () => void;
}

export const AddBotDialog = ({ open, onOpenChange, onBotAdded }: AddBotDialogProps) => {
  const [botToken, setBotToken] = useState("");
  const [personalUserId, setPersonalUserId] = useState("");
  const [greetingMessage, setGreetingMessage] = useState("你好！👋 有什么可以帮助你的吗？");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!botToken || !personalUserId) {
      toast({
        title: "错误",
        description: "请填写机器人令牌和个人用户ID",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 检查是否已存在该令牌
      const { data: existing } = await supabase
        .from('bot_activations')
        .select('id, is_authorized, trial_messages_used, trial_limit')
        .eq('bot_token', botToken)
        .maybeSingle();

      if (existing) {
        // 如果已存在且未授权且试用已满，拒绝
        if (!existing.is_authorized && existing.trial_messages_used >= existing.trial_limit) {
          toast({
            title: "无法添加",
            description: "此机器人令牌已用完试用额度，需要授权激活才能继续使用",
            variant: "destructive",
          });
          return;
        }
        
        toast({
          title: "已存在",
          description: "此机器人令牌已添加到系统中",
        });
        onBotAdded();
        onOpenChange(false);
        return;
      }

      // 创建新的激活（试用模式）
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'create-trial',
          botToken,
          personalUserId,
          greetingMessage,
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast({
        title: "添加成功",
        description: `机器人已添加，可免费试用 ${data.data.trial_limit} 条消息`,
      });

      setBotToken("");
      setPersonalUserId("");
      setGreetingMessage("你好！👋 有什么可以帮助你的吗？");
      onBotAdded();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "添加失败",
        description: error.message || "请检查令牌是否正确",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            添加 Telegram 机器人
          </DialogTitle>
          <DialogDescription>
            输入机器人信息即可开始试用，无需注册。免费试用20条消息。
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="botToken">机器人令牌 (Bot Token) *</Label>
            <Input
              id="botToken"
              placeholder="例如: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              从 @BotFather 获取的机器人令牌
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="personalUserId">您的 Telegram 用户ID *</Label>
            <Input
              id="personalUserId"
              placeholder="例如: 123456789"
              value={personalUserId}
              onChange={(e) => setPersonalUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              用于接收消息转发，可从 @userinfobot 获取
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="greetingMessage">欢迎语</Label>
            <Textarea
              id="greetingMessage"
              placeholder="用户发送 /start 时的自动回复"
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            <Plus className="h-4 w-4 mr-1" />
            {isLoading ? "添加中..." : "开始试用"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddBotDialog;
