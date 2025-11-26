import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TelegramBot } from "@/components/TelegramBot";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "telegram_bot_activations";

interface BotActivation {
  id: string;
  botToken: string;
  personalUserId: string;
  greetingMessage: string;
  expiryDate: string;
  isActive: boolean;
  createdAt: string;
}

export const BotClient = () => {
  const { activationId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activation, setActivation] = useState<BotActivation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activationId) {
      navigate("/");
      return;
    }

    // 从localStorage加载激活信息
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const activations: BotActivation[] = JSON.parse(stored);
      const found = activations.find(a => a.id === activationId);
      
      if (found) {
        // 检查是否过期或未激活
        const isExpired = new Date(found.expiryDate) < new Date();
        if (!found.isActive || isExpired) {
          toast({
            title: "访问被拒绝",
            description: isExpired ? "此激活已过期" : "此激活已被停用",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        setActivation(found);
        
        // 保存配置到专用的localStorage key
        const configKey = `bot_config_${activationId}`;
        localStorage.setItem(configKey, JSON.stringify({
          botToken: found.botToken,
          personalUserId: found.personalUserId,
          greetingMessage: found.greetingMessage,
        }));
      } else {
        toast({
          title: "激活不存在",
          description: "找不到此激活ID，请联系管理员",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "无激活记录",
        description: "系统中没有激活记录",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  }, [activationId, navigate, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8">
          <p className="text-muted-foreground">正在加载...</p>
        </Card>
      </div>
    );
  }

  if (!activation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-xl font-bold mb-4">访问被拒绝</h2>
          <p className="text-muted-foreground mb-6">
            此机器人激活不可用或已过期。
          </p>
          <Button onClick={() => navigate("/")}>
            返回首页
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TelegramBot 
        botToken={activation.botToken}
        personalUserId={activation.personalUserId}
        greetingMessage={activation.greetingMessage}
        activationId={activationId}
      />
    </div>
  );
};

export default BotClient;
