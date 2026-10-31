'use client';

import { useEffect } from 'react';
import { motion, stagger, useAnimate } from 'framer-motion';

export const TextGenerateEffect = ({
  words,
  className = '',
  filter = true,
  duration = 0.5,
  highlightWord = '',
  highlightClassName = 'bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent',
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
  highlightWord?: string;
  highlightClassName?: string;
}) => {
  const [scope, animate] = useAnimate();
  const wordsArray = words.split(' ');

  useEffect(() => {
    animate(
      'span',
      {
        opacity: 1,
        filter: filter ? 'blur(0px)' : 'none',
      },
      {
        duration: duration ? duration : 1,
        delay: stagger(0.12),
      }
    );
  }, [animate, duration, filter]);

  const renderWords = () => {
    return (
      <motion.span ref={scope}>
        {wordsArray.map((word, idx) => {
          const isHighlighted =
            highlightWord &&
            word.toLowerCase().includes(highlightWord.toLowerCase());
          return (
            <motion.span
              key={word + idx}
              className={`opacity-0 ${
                isHighlighted ? highlightClassName : 'text-[#F8FAFC]'
              } ${filter ? 'blur-[8px]' : ''}`}
            >
              {word}{' '}
            </motion.span>
          );
        })}
      </motion.span>
    );
  };

  return (
    <div className={`font-bold ${className}`}>
      <div className="leading-snug tracking-tight">{renderWords()}</div>
    </div>
  );
};

