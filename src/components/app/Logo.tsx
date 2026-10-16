import wordmark from "@/assets/logo-wordmark.png";
export const Logo = ({ className = "h-10" }: { className?: string }) => (
  <img src={wordmark} alt="Meiyiyal" className={`${className} w-auto select-none dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5`} draggable={false} />
);
