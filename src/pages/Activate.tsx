import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, ArrowRight } from "lucide-react";

export const Activate = () => {
  const { activationCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleActivate = async () => {
    if (!botToken.trim()) {
      toast({
        title: "错误",
        description: "请输入机器人令牌",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot', {
        body: {
          action: 'authorize',
          activationCode,
          botToken: botToken.trim(),
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast({
        title: "激活成功！",
        description: "机器人已成功激活，即将跳转到控制台",
      });

      // 跳转到机器人控制台
      setTimeout(() => {
        navigate(`/console/${data.data.id}`);
      }, 1500);
    } catch (error: any) {
      toast({
        title: "激活失败",
        description: error.message || "请检查令牌是否正确",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">激活机器人服务</h1>
          <p className="text-muted-foreground mt-2">
            请输入您的机器人令牌以完成激活
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">激活码</label>
            <Input
              value={activationCode || ""}
              disabled
              className="mt-2 bg-muted"
            />
          </div>
          <div>
            <label className="text-sm font-medium">机器人令牌 (Bot Token)</label>
            <Input
              placeholder="输入您的机器人令牌..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleActivate()}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              从 @BotFather 获取的令牌
            </p>
          </div>
          <Button 
            onClick={handleActivate} 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? "激活中..." : (
              <>
                激活 <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h3 className="font-medium text-sm mb-2">激活说明</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• 激活后，机器人将24小时在线运行</li>
            <li>• 新用户可免费试用20条消息</li>
            <li>• 试用结束后需联系管理员开通完整服务</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default Activate;
