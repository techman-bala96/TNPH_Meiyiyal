import wordmark from "@/assets/logo-wordmark.png";
export const Logo = ({ className = "h-10" }: { className?: string }) => (
  <img src={wordmark} alt="Meiyiyal" className={`${className} w-auto select-none`} draggable={false} />
);
