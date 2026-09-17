import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuideFlow, GuideStep } from "./guide-catalog";
import {
  advanceGuide,
  exitGuide,
  readGuideProgress,
  startGuide,
  writeGuideProgress,
  type GuideProgress,
} from "./guide-state";

interface GuideEngine {
  progress: GuideProgress;
  currentStep: GuideStep;
  targetFound: boolean;
  start: () => void;
  restart: () => void;
  exit: () => void;
}

/**
 * Run one browser-local guide by binding its current semantic target.
 * @param flow - Valid guide definition loaded from the canonical YAML
 * @returns Progress, current step, target status, and lifecycle commands
 */
export function useGuideEngine(flow: GuideFlow): GuideEngine {
  const initial = useMemo(
    () => readGuideProgress(window.localStorage, flow),
    [flow],
  );
  const [progress, setProgress] = useState(initial);
  const [targetFound, setTargetFound] = useState(false);
  const currentStep =
    flow.steps[Math.min(progress.stepIndex, flow.steps.length - 1)];

  useEffect(() => {
    writeGuideProgress(window.localStorage, progress);
  }, [progress]);

  const advance = useCallback(() => {
    setProgress((current) =>
      advanceGuide(flow, current, new Date().toISOString()),
    );
  }, [flow]);

  useEffect(() => {
    if (progress.status !== "active") {
      setTargetFound(false);
      return;
    }

    let target: HTMLElement | null = null;
    let visibleTimer: number | null = null;
    let settled = false;

    /**
     * Advance once for the DOM event required by the current step.
     * @param event - Native target event
     * @returns Nothing
     */
    function handleTargetEvent(event: Event): void {
      if (settled) return;
      if (currentStep.advance === "input") {
        const control = event.currentTarget;
        if (
          !(control instanceof HTMLInputElement) &&
          !(control instanceof HTMLTextAreaElement)
        ) {
          return;
        }
        if (!control.value.trim()) return;
      }
      settled = true;
      advance();
    }

    /**
     * Advance a confirm step only when its semantic target matches.
     * @param event - Custom guide:confirm event with optional target detail
     * @returns Nothing
     */
    function handleConfirm(event: Event): void {
      const detail = (event as CustomEvent<{ target?: string }>).detail;
      if (detail?.target !== currentStep.target || settled) return;
      settled = true;
      advance();
    }

    /**
     * Locate and bind the current target; return true once successful.
     * @returns Whether a matching element is present
     */
    function bindTarget(): boolean {
      const found = document.querySelector<HTMLElement>(
        `[data-guide-id="${currentStep.target}"]`,
      );
      if (!found) return false;
      target = found;
      setTargetFound(true);
      target.classList.add("guide-target-active");
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

      if (currentStep.advance === "visible") {
        visibleTimer = window.setTimeout(() => {
          settled = true;
          advance();
        }, 700);
      } else if (currentStep.advance === "confirm") {
        window.addEventListener("guide:confirm", handleConfirm);
      } else {
        target.addEventListener(currentStep.advance, handleTargetEvent);
      }
      return true;
    }

    setTargetFound(false);
    const observer = new MutationObserver(() => {
      if (bindTarget()) observer.disconnect();
    });
    if (!bindTarget()) {
      // Product state changes (for example thread creation) may reveal the next target.
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      if (visibleTimer !== null) window.clearTimeout(visibleTimer);
      if (target && currentStep.advance !== "confirm") {
        target.removeEventListener(currentStep.advance, handleTargetEvent);
      }
      window.removeEventListener("guide:confirm", handleConfirm);
      target?.classList.remove("guide-target-active");
    };
  }, [advance, currentStep, progress.status]);

  return {
    progress,
    currentStep,
    targetFound,
    start: () =>
      setProgress((current) =>
        startGuide(flow, current, new Date().toISOString()),
      ),
    restart: () =>
      setProgress((current) =>
        startGuide(flow, current, new Date().toISOString(), true),
      ),
    exit: () => setProgress((current) => exitGuide(current)),
  };
}
