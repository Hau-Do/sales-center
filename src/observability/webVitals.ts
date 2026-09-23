import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { logger } from './logger'

/**
 * Core Web Vitals, reported into the same structured log as everything else.
 *
 * Definitions worth stating, because they are commonly inverted: a CLS session
 * window ends after a 1-second gap between shifts, and is capped at 5 seconds
 * total. LCP and INP are reported at their final value when the page is hidden.
 */
export function reportWebVitals(): void {
  const report = (metric: Metric): void => {
    logger.info('web_vital', {
      name: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      navigationType: metric.navigationType,
    })
  }

  onCLS(report)
  onFCP(report)
  onINP(report)
  onLCP(report)
  onTTFB(report)
}
