'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CustomCursorProps {
  className?: string;
}

export function CustomCursor({ className }: CustomCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [cursorText, setCursorText] = useState('');

  // Motion values for smooth cursor movement
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  // Spring physics for smooth following
  const springConfig = { damping: 25, stiffness: 300, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    // Don't show custom cursor on touch devices
    if ('ontouchstart' in window) return;

    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      setIsVisible(true);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check for interactive elements
      const isInteractive = 
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.closest('a') ||
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('[data-cursor="pointer"]') ||
        target.classList.contains('cursor-pointer');

      // Check for specific cursor text
      const cursorTextAttr = target.getAttribute('data-cursor-text') || 
                            target.closest('[data-cursor-text]')?.getAttribute('data-cursor-text');

      if (cursorTextAttr) {
        setCursorText(cursorTextAttr);
        setIsHovering(true);
      } else if (isInteractive) {
        setIsHovering(true);
        setCursorText('');
      }
    };

    const handleMouseLeave = () => {
      setIsHovering(false);
      setCursorText('');
    };

    const handleMouseOut = () => {
      setIsVisible(false);
    };

    // Add event listeners
    window.addEventListener('mousemove', moveCursor);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseout', handleMouseOut);

    // Add hover listeners to all interactive elements
    document.querySelectorAll('a, button, [role="button"], [data-cursor="pointer"], .cursor-pointer, [data-cursor-text]').forEach(el => {
      el.addEventListener('mouseenter', handleMouseEnter as EventListener);
      el.addEventListener('mouseleave', handleMouseLeave);
    });

    // Observer for dynamically added elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const interactiveElements = node.querySelectorAll('a, button, [role="button"], [data-cursor="pointer"], .cursor-pointer, [data-cursor-text]');
            interactiveElements.forEach(el => {
              el.addEventListener('mouseenter', handleMouseEnter as EventListener);
              el.addEventListener('mouseleave', handleMouseLeave);
            });
            
            // Check if the node itself is interactive
            if (node.matches('a, button, [role="button"], [data-cursor="pointer"], .cursor-pointer, [data-cursor-text]')) {
              node.addEventListener('mouseenter', handleMouseEnter as EventListener);
              node.addEventListener('mouseleave', handleMouseLeave);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseout', handleMouseOut);
      observer.disconnect();
    };
  }, [cursorX, cursorY]);

  // Hide on touch devices
  if (typeof window !== 'undefined' && 'ontouchstart' in window) {
    return null;
  }

  return (
    <>
      {/* Main cursor ring */}
      <motion.div
        ref={cursorRef}
        className={cn(
          'fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference',
          !isVisible && 'opacity-0',
          className
        )}
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
        }}
      >
        {/* Outer ring */}
        <motion.div
          className="absolute rounded-full border-2 border-white"
          initial={{ width: 40, height: 40, x: -20, y: -20 }}
          animate={{
            width: isHovering ? (cursorText ? 120 : 60) : isClicking ? 30 : 40,
            height: isHovering ? (cursorText ? 120 : 60) : isClicking ? 30 : 40,
            x: isHovering ? (cursorText ? -60 : -30) : isClicking ? -15 : -20,
            y: isHovering ? (cursorText ? -60 : -30) : isClicking ? -15 : -20,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
        >
          {/* Cursor text */}
          {cursorText && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium uppercase tracking-wider"
            >
              {cursorText}
            </motion.span>
          )}
        </motion.div>

        {/* Inner dot */}
        <motion.div
          className="absolute rounded-full bg-white"
          initial={{ width: 8, height: 8, x: -4, y: -4 }}
          animate={{
            width: isHovering ? 0 : isClicking ? 12 : 8,
            height: isHovering ? 0 : isClicking ? 12 : 8,
            x: isHovering ? 0 : isClicking ? -6 : -4,
            y: isHovering ? 0 : isClicking ? -6 : -4,
            opacity: isHovering ? 0 : 1,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20,
          }}
        />
      </motion.div>

      {/* Hide default cursor globally */}
      <style jsx global>{`
        @media (hover: hover) and (pointer: fine) {
          * {
            cursor: none !important;
          }
        }
      `}</style>
    </>
  );
}

export default CustomCursor;
