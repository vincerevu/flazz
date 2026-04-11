"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const BOTTOM_THRESHOLD = 10;
const SETTLING_MS = 300;

interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: (element: HTMLDivElement | null) => void;
  isAtBottom: boolean;
  userScrolled: boolean;
  handleScroll: () => void;
  handleInteraction: () => void;
  scrollToBottom: (force?: boolean) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversationContext() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used within Conversation.");
  }
  return context;
}

function distanceFromBottom(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}

function canScroll(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight > 1;
}

export type ConversationProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const Conversation = ({ className, children, ...props }: ConversationProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const autoScrollRef = useRef<{ top: number; time: number } | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settlingRef = useRef(false);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markAuto = useCallback((element: HTMLElement) => {
    autoScrollRef.current = {
      top: Math.max(0, element.scrollHeight - element.clientHeight),
      time: Date.now(),
    };

    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      autoScrollRef.current = null;
      autoTimerRef.current = null;
    }, 1500);
  }, []);

  const isAutoScroll = useCallback((element: HTMLElement) => {
    const auto = autoScrollRef.current;
    if (!auto) return false;
    if (Date.now() - auto.time > 1500) {
      autoScrollRef.current = null;
      return false;
    }
    return Math.abs(element.scrollTop - auto.top) < 2;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const element = scrollRef.current;
    if (!element) return;

    if (!force && userScrolled) return;
    if (!canScroll(element)) {
      setUserScrolled(false);
      setIsAtBottom(true);
      return;
    }

    const distance = distanceFromBottom(element);
    if (distance < 2) {
      markAuto(element);
      setIsAtBottom(true);
      return;
    }

    if (force && userScrolled) {
      setUserScrolled(false);
    }

    markAuto(element);
    element.scrollTop = element.scrollHeight;
    setIsAtBottom(true);
  }, [markAuto, userScrolled]);

  const stopFollowing = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (!canScroll(element)) {
      setUserScrolled(false);
      setIsAtBottom(true);
      return;
    }
    setUserScrolled(true);
    setIsAtBottom(false);
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (!canScroll(element)) {
      setUserScrolled(false);
      setIsAtBottom(true);
      return;
    }

    const atBottom = distanceFromBottom(element) < BOTTOM_THRESHOLD;
    setIsAtBottom(atBottom);

    if (atBottom) {
      setUserScrolled(false);
      return;
    }

    if (!userScrolled && isAutoScroll(element)) {
      scrollToBottom(false);
      return;
    }

    stopFollowing();
  }, [isAutoScroll, scrollToBottom, stopFollowing, userScrolled]);

  const handleInteraction = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      stopFollowing();
    }
  }, [stopFollowing]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const nestedScrollable = target?.closest("[data-scrollable]");
      if (nestedScrollable && nestedScrollable !== element) return;
      stopFollowing();
    };

    element.addEventListener("wheel", handleWheel, { passive: true });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [stopFollowing]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !contentElement) return;

    const updateOverflowAnchor = () => {
      element.style.overflowAnchor = userScrolled ? "auto" : "none";
    };

    updateOverflowAnchor();

    const resizeObserver = new ResizeObserver(() => {
      if (userScrolled) return;
      if (!canScroll(element)) {
        setUserScrolled(false);
        setIsAtBottom(true);
        return;
      }
      scrollToBottom(false);
    });

    resizeObserver.observe(contentElement);
    return () => resizeObserver.disconnect();
  }, [contentElement, scrollToBottom, userScrolled]);

  useEffect(() => {
    if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    settlingRef.current = true;
    if (!userScrolled) {
      scrollToBottom(true);
    }
    settlingTimerRef.current = setTimeout(() => {
      settlingRef.current = false;
      settlingTimerRef.current = null;
    }, SETTLING_MS);

    return () => {
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
      settlingTimerRef.current = null;
      settlingRef.current = false;
    };
  }, [children, scrollToBottom, userScrolled]);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (settlingTimerRef.current) clearTimeout(settlingTimerRef.current);
    };
  }, []);

  const contextValue = useMemo<ConversationContextValue>(() => ({
    scrollRef,
    contentRef: setContentElement,
    isAtBottom,
    userScrolled,
    handleScroll,
    handleInteraction,
    scrollToBottom,
  }), [handleInteraction, handleScroll, isAtBottom, scrollToBottom, userScrolled]);

  return (
    <ConversationContext.Provider value={contextValue}>
      <div
        ref={scrollRef}
        className={cn("relative flex-1 overflow-y-auto [scrollbar-gutter:stable]", className)}
        onScroll={handleScroll}
        role="log"
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
};

export const ScrollPositionPreserver = () => null;

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => {
  const { contentRef, handleInteraction } = useConversationContext();

  return (
    <div
      ref={contentRef}
      className={cn("flex flex-col gap-8 p-4", className)}
      onClick={handleInteraction}
      {...props}
    />
  );
};

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useConversationContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
