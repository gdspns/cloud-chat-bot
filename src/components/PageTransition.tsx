import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
      {children}
    </div>
  );
};

export default PageTransition;
