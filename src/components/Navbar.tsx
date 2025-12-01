import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bot, Home, LogIn, UserPlus, Settings } from "lucide-react";

export const Navbar = () => {
  const location = useLocation();
  
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <Bot className="h-6 w-6 text-primary" />
          <span>TG机器人管理</span>
        </Link>
        
        <div className="flex items-center gap-2">
          <Button 
            variant={location.pathname === "/" ? "default" : "ghost"} 
            size="sm" 
            asChild
          >
            <Link to="/">
              <Home className="h-4 w-4 mr-1" />
              首页
            </Link>
          </Button>
          
          <Button 
            variant={location.pathname === "/auth" ? "default" : "ghost"} 
            size="sm" 
            asChild
          >
            <Link to="/auth?mode=register">
              <UserPlus className="h-4 w-4 mr-1" />
              注册
            </Link>
          </Button>
          
          <Button 
            variant={location.pathname === "/auth" ? "default" : "ghost"} 
            size="sm" 
            asChild
          >
            <Link to="/auth?mode=login">
              <LogIn className="h-4 w-4 mr-1" />
              登录
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
