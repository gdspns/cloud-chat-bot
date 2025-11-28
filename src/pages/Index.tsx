import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bot, Shield, Clock, MessageSquare } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-6 py-16 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Bot className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Telegram 机器人管理平台
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          7x24小时持续运行，网站控制台与Telegram APP双向无缝聊天
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" onClick={() => navigate("/admin")}>
            管理后台
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">核心功能</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 text-center">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="font-semibold mb-2">24/7 在线</h3>
            <p className="text-sm text-muted-foreground">
              关闭网页后机器人仍持续运行，永不掉线
            </p>
          </Card>
          
          <Card className="p-6 text-center">
            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="font-semibold mb-2">双向通信</h3>
            <p className="text-sm text-muted-foreground">
              网页控制台与Telegram APP实时同步消息
            </p>
          </Card>
          
          <Card className="p-6 text-center">
            <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="h-6 w-6 text-purple-500" />
            </div>
            <h3 className="font-semibold mb-2">多机器人支持</h3>
            <p className="text-sm text-muted-foreground">
              同时管理多个机器人，消息互不干扰
            </p>
          </Card>
          
          <Card className="p-6 text-center">
            <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-orange-500" />
            </div>
            <h3 className="font-semibold mb-2">安全授权</h3>
            <p className="text-sm text-muted-foreground">
              令牌验证机制，确保只有授权机器人可使用
            </p>
          </Card>
        </div>
      </div>

      {/* How It Works */}
      <div className="container mx-auto px-6 py-16 bg-muted/50">
        <h2 className="text-3xl font-bold text-center mb-12">使用流程</h2>
        <div className="max-w-3xl mx-auto">
          <div className="space-y-6">
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold">管理员添加授权</h3>
                <p className="text-muted-foreground">
                  在管理后台添加机器人令牌并设置有效期，系统自动生成专属激活链接
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold">用户访问激活链接</h3>
                <p className="text-muted-foreground">
                  用户收到激活链接后，输入自己的机器人令牌进行验证激活
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold">开始使用</h3>
                <p className="text-muted-foreground">
                  激活成功后即可在控制台与Telegram用户实时聊天，支持免费试用20条消息
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-8 text-center text-muted-foreground">
        <p>Telegram 机器人管理平台 © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default Index;
