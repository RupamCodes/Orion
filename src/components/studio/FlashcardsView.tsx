'use client';

import React, { useState } from 'react';
import { StudioArtifact, Flashcard, SourceDoc } from '../../lib/types';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  CheckCircle2, 
  HelpCircle, 
  Sparkles, 
  BookOpen, 
  Shuffle,
  ExternalLink
} from 'lucide-react';

interface FlashcardsViewProps {
  artifact: StudioArtifact;
  sources: SourceDoc[];
  onOpenSourceModal: (source: SourceDoc, highlightText?: string) => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  artifact,
  sources,
  onOpenSourceModal,
}) => {
  const rawCards: Flashcard[] = artifact.structured_content?.cards || artifact.flashcards || [];
  const [cards, setCards] = useState<Flashcard[]>(rawCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCardIds, setKnownCardIds] = useState<Set<string>>(new Set());
  const [reviewCardIds, setReviewCardIds] = useState<Set<string>>(new Set());

  // Reset when artifact changes
  React.useEffect(() => {
    const fresh = artifact.structured_content?.cards || artifact.flashcards || [];
    setCards(fresh);
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCardIds(new Set());
    setReviewCardIds(new Set());
  }, [artifact.id]);

  if (!cards || cards.length === 0) {
    return (
      <div className="text-center py-12 px-4 text-inherit opacity-70 text-xs">
        <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="font-medium mb-1">No flashcards available in this deck.</p>
      </div>
    );
  }

  const currentCard = cards[currentIndex] || cards[0];
  const isKnown = knownCardIds.has(currentCard.id);
  const isReview = reviewCardIds.has(currentCard.id);

  const handleNext = React.useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  }, [cards.length]);

  const handlePrev = React.useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  }, [cards.length]);

  const handleToggleFlip = React.useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Keyboard navigation: Space/Enter to flip, ArrowLeft/ArrowRight to cycle
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger shortcuts when typing in inputs, textareas, selects, or editable fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' ||
         target.isContentEditable)
      ) {
        return;
      }

      // Ignore if user is using browser modifiers (Cmd/Ctrl/Alt)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleToggleFlip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleFlip, handlePrev, handleNext]);

  const markKnown = () => {
    const nextKnown = new Set(knownCardIds);
    const nextReview = new Set(reviewCardIds);
    nextKnown.add(currentCard.id);
    nextReview.delete(currentCard.id);
    setKnownCardIds(nextKnown);
    setReviewCardIds(nextReview);
    handleNext();
  };

  const markReview = () => {
    const nextKnown = new Set(knownCardIds);
    const nextReview = new Set(reviewCardIds);
    nextReview.add(currentCard.id);
    nextKnown.delete(currentCard.id);
    setKnownCardIds(nextKnown);
    setReviewCardIds(nextReview);
    handleNext();
  };

  const handleShuffle = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleOpenSource = () => {
    const sourceId = currentCard.source_id;
    const targetSource = sources.find(s => s.id === sourceId) || sources[0];
    if (targetSource) {
      onOpenSourceModal(targetSource, currentCard.snippet);
    }
  };

  const progressPercent = Math.round(((currentIndex + 1) / cards.length) * 100);

  return (
    <div className="space-y-4 select-none">
      {/* Deck Header & Progress Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 opacity-80">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold truncate max-w-[190px]">
            {artifact.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShuffle}
            className="p-1.5 rounded-lg hover:bg-surface-hover opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Shuffle Deck"
            aria-label="Shuffle flashcards"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] opacity-70">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>
      </div>

      {/* Progress Line */}
      <div className="w-full bg-surface-panel h-1.5 rounded-full overflow-hidden border border-surface-border">
        <div
          className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Interactive Flashcard Card */}
      <div
        tabIndex={0}
        role="region"
        aria-label={`Flashcard: ${isFlipped ? 'Answer' : 'Question'}. Press Space or Enter to flip.`}
        onClick={handleToggleFlip}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleToggleFlip();
          }
        }}
        className={`relative min-h-[220px] rounded-2xl p-5 border cursor-pointer transition-all duration-300 flex flex-col justify-between shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base ${
          isFlipped
            ? 'bg-gradient-to-br from-surface-hover to-surface-panel border-indigo-500/50'
            : 'bg-surface-panel border-surface-border hover:border-surface-borderHover'
        }`}
      >
        {/* Top bar of Card */}
        <div className="flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-surface-base border border-surface-border opacity-70">
            {currentCard.category || 'Concept'}
          </span>
          <span className="text-[10px] font-mono opacity-50 flex items-center gap-1">
            <RotateCw className="w-3 h-3" />
            {isFlipped ? 'Answer (Click or Space to flip)' : 'Question (Click or Space to flip)'}
          </span>
        </div>

        {/* Card Body */}
        <div className="py-4 my-auto">
          {!isFlipped ? (
            <p className="text-sm font-medium leading-relaxed opacity-95">
              {currentCard.question}
            </p>
          ) : (
            <div className="space-y-2 animate-fade-in">
              <p className="text-xs leading-relaxed opacity-90 font-normal">
                {currentCard.answer}
              </p>
              {currentCard.source_title && (
                <div className="pt-2 border-t border-surface-border/50 flex items-center justify-between text-[10px] opacity-60">
                  <span className="truncate max-w-[170px]">
                    Source: {currentCard.source_title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSource();
                    }}
                    className="flex items-center gap-0.5 text-indigo-400 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
                    aria-label="View evidence in source document"
                  >
                    Evidence <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card Status Indicator */}
        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-surface-border/40">
          <div className="flex items-center gap-1">
            {isKnown && (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[10px]">
                <CheckCircle2 className="w-3 h-3" /> Known
              </span>
            )}
            {isReview && (
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium text-[10px]">
                <HelpCircle className="w-3 h-3" /> In Review
              </span>
            )}
          </div>
          <span className="text-[10px] opacity-50 font-sans">
            Space/Enter to flip · ← / → to navigate
          </span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handlePrev}
          className="p-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs transition-colors flex items-center gap-1 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Previous card (ArrowLeft)"
          aria-label="Previous card (ArrowLeft)"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markReview}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              isReview
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-surface-panel hover:bg-surface-hover border-surface-border text-amber-400 opacity-80 hover:opacity-100'
            }`}
            title="Mark for review"
            aria-label="Mark card for review"
          >
            Review Again
          </button>

          <button
            type="button"
            onClick={markKnown}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isKnown
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-surface-panel hover:bg-surface-hover border-surface-border text-emerald-400 opacity-80 hover:opacity-100'
            }`}
            title="Mark as known"
            aria-label="Mark card as known"
          >
            Know It
          </button>
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="p-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-surface-border text-xs transition-colors flex items-center gap-1 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Next card (ArrowRight)"
          aria-label="Next card (ArrowRight)"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mastery Stats Bar */}
      <div className="grid grid-cols-3 gap-2 pt-2 text-center text-[10px]">
        <div className="p-2 rounded-xl bg-surface-panel border border-surface-border">
          <div className="opacity-50">Total Cards</div>
          <div className="font-semibold text-xs mt-0.5">{cards.length}</div>
        </div>
        <div className="p-2 rounded-xl bg-surface-panel border border-surface-border">
          <div className="opacity-50 text-emerald-400">Mastered</div>
          <div className="font-semibold text-xs mt-0.5 text-emerald-400">{knownCardIds.size}</div>
        </div>
        <div className="p-2 rounded-xl bg-surface-panel border border-surface-border">
          <div className="opacity-50 text-amber-400">To Review</div>
          <div className="font-semibold text-xs mt-0.5 text-amber-400">{reviewCardIds.size}</div>
        </div>
      </div>
    </div>
  );
};
