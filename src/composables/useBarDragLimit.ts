import type { GanttBarObject } from "../types"
import provideConfig from "../provider/provideConfig"
import useBarDragManagement from "./useBarDragManagement"
import { inject } from "vue"
import type { UseRowsReturn } from "./useRows"
import { GANTT_ID_KEY } from "../provider/symbols"
import useBarSelector from "./useBarSelector"

export default function useBarDragLimit() {
  const { pushOnOverlap, pushOnConnect } = provideConfig()
  const { getConnectedBars } = useBarDragManagement()
  const rowManager = inject<UseRowsReturn>("useRows")!
  const ganttId = inject(GANTT_ID_KEY)!
  const { findBarElement } = useBarSelector()

  const getBarsFromBundle = (bundle?: string) => {
    const res: GanttBarObject[] = []
    if (bundle != null) {
      rowManager.rows.value.forEach((row) => {
        row.bars.forEach((bar) => {
          if (bar.ganttBarConfig.bundle === bundle) {
            res.push(bar)
          }
        })
      })
    }
    return res
  }

  const setDragLimitsOfGanttBar = (bar: GanttBarObject) => {
    if (
      !pushOnOverlap.value ||
      bar.ganttBarConfig.pushOnOverlap === false ||
      !pushOnConnect.value ||
      bar.ganttBarConfig.pushOnConnect === false
    ) {
      return
    }
    for (const sideValue of ["left", "right"]) {
      const side = sideValue as "left" | "right"
      const { gapDistanceSoFar, bundleBarsAndGapDist } = countGapDistanceToNextImmobileBar(
        bar,
        0,
        side
      )

      let totalGapDistance = gapDistanceSoFar
      const bundleBarsOnPath = bundleBarsAndGapDist
      if (!bundleBarsOnPath) {
        continue
      }

      for (let i = 0; i < bundleBarsOnPath.length; i++) {
        const barFromBundle = bundleBarsOnPath[i]!.bar
        const gapDist = bundleBarsOnPath[i]!.gapDistance
        const otherBarsFromBundle = getBarsFromBundle(barFromBundle.ganttBarConfig.bundle).filter(
          (otherBar) => otherBar !== barFromBundle
        )
        otherBarsFromBundle.forEach((otherBar) => {
          const nextGapDistanceAndBars = countGapDistanceToNextImmobileBar(otherBar, gapDist, side)
          const newGapDistance = nextGapDistanceAndBars.gapDistanceSoFar
          const newBundleBars = nextGapDistanceAndBars.bundleBarsAndGapDist
          if (newGapDistance != null && (!totalGapDistance || newGapDistance < totalGapDistance)) {
            totalGapDistance = newGapDistance
          }
          newBundleBars.forEach((newBundleBar) => {
            if (!bundleBarsOnPath.find((barAndGap) => barAndGap.bar === newBundleBar.bar)) {
              bundleBarsOnPath.push(newBundleBar)
            }
          })
        })
      }
      const barElem = findBarElement(ganttId, bar.ganttBarConfig.id) as HTMLElement
      if (totalGapDistance != null && side === "left") {
        bar.ganttBarConfig.dragLimitLeft = barElem.offsetLeft - totalGapDistance
      } else if (totalGapDistance != null && side === "right") {
        bar.ganttBarConfig.dragLimitRight =
          barElem.offsetLeft + barElem.offsetWidth + totalGapDistance
      }
    }
    // all bars from the bundle of the clicked bar need to have the same drag limit:
    const barsFromBundleOfClickedBar = getBarsFromBundle(bar.ganttBarConfig.bundle)
    barsFromBundleOfClickedBar.forEach((barFromBundle) => {
      barFromBundle.ganttBarConfig.dragLimitLeft = bar.ganttBarConfig.dragLimitLeft
      barFromBundle.ganttBarConfig.dragLimitRight = bar.ganttBarConfig.dragLimitRight
    })
  }

  // returns the gap distance to the next immobile bar
  // in the row where the given bar (parameter) is (added to gapDistanceSoFar)
  // and a list of all bars on that path that belong to a bundle
  const countGapDistanceToNextImmobileBar = (
    bar: GanttBarObject,
    gapDistanceSoFar = 0,
    side: "left" | "right"
  ) => {
    const bundleBarsAndGapDist = bar.ganttBarConfig.bundle
      ? [{ bar, gapDistance: gapDistanceSoFar }]
      : []
    let currentBar = bar
    let nextBar = getNextGanttBar(currentBar, side)
    // left side:
    if (side === "left") {
      while (nextBar) {
        const currentBarElem = findBarElement(ganttId, currentBar.ganttBarConfig.id) as HTMLElement
        const nextBarElem = findBarElement(ganttId, nextBar.ganttBarConfig.id) as HTMLElement
        const nextBarOffsetRight = nextBarElem.offsetLeft + nextBarElem.offsetWidth
        gapDistanceSoFar += currentBarElem.offsetLeft - nextBarOffsetRight
        if (nextBar.ganttBarConfig.immobile) {
          return { gapDistanceSoFar, bundleBarsAndGapDist }
        } else if (nextBar.ganttBarConfig.bundle) {
          bundleBarsAndGapDist.push({
            bar: nextBar,
            gapDistance: gapDistanceSoFar
          })
        }
        currentBar = nextBar
        nextBar = getNextGanttBar(nextBar, "left")
      }
    }
    if (side === "right") {
      while (nextBar) {
        const currentBarElem = findBarElement(ganttId, currentBar.ganttBarConfig.id) as HTMLElement
        const nextBarElem = findBarElement(ganttId, nextBar.ganttBarConfig.id) as HTMLElement
        const currentBarOffsetRight = currentBarElem.offsetLeft + currentBarElem.offsetWidth
        gapDistanceSoFar += nextBarElem.offsetLeft - currentBarOffsetRight
        if (nextBar.ganttBarConfig.immobile) {
          return { gapDistanceSoFar, bundleBarsAndGapDist }
        } else if (nextBar.ganttBarConfig.bundle) {
          bundleBarsAndGapDist.push({
            bar: nextBar,
            gapDistance: gapDistanceSoFar
          })
        }
        currentBar = nextBar
        nextBar = getNextGanttBar(nextBar, "right")
      }
    }
    return { gapDistanceSoFar: null, bundleBarsAndGapDist }
  }

  const getNextGanttBar = (bar: GanttBarObject, side: "left" | "right") => {
    const barElem = findBarElement(ganttId, bar.ganttBarConfig.id) as HTMLElement
    let allBarsInRow: GanttBarObject[] = []
    if (pushOnOverlap.value) {
      allBarsInRow = rowManager.rows.value.find((row) => row.bars.includes(bar))?.bars || []
    }
    if (pushOnConnect.value) {
      allBarsInRow = [...allBarsInRow, ...getConnectedBars(bar)]
    }
    let allBarsLeftOrRight = []
    if (side === "left") {
      allBarsLeftOrRight = allBarsInRow.filter((otherBar) => {
        const otherBarElem = findBarElement(ganttId, otherBar.ganttBarConfig.id) as HTMLElement
        return (
          otherBarElem &&
          otherBarElem.offsetLeft < barElem.offsetLeft &&
          otherBar.ganttBarConfig.pushOnOverlap !== false &&
          otherBar.ganttBarConfig.pushOnConnect !== false
        )
      })
    } else {
      allBarsLeftOrRight = allBarsInRow.filter((otherBar) => {
        const otherBarElem = findBarElement(ganttId, otherBar.ganttBarConfig.id) as HTMLElement
        return (
          otherBarElem &&
          otherBarElem.offsetLeft > barElem.offsetLeft &&
          otherBar.ganttBarConfig.pushOnOverlap !== false &&
          otherBar.ganttBarConfig.pushOnConnect !== false
        )
      })
    }
    if (allBarsLeftOrRight.length > 0) {
      return allBarsLeftOrRight.reduce((bar1, bar2) => {
        const bar1Elem = findBarElement(ganttId, bar1!.ganttBarConfig.id) as HTMLElement
        const bar2Elem = findBarElement(ganttId, bar2.ganttBarConfig.id) as HTMLElement
        const bar1Dist = Math.abs(bar1Elem.offsetLeft - barElem.offsetLeft)
        const bar2Dist = Math.abs(bar2Elem.offsetLeft - barElem.offsetLeft)
        return bar1Dist < bar2Dist ? bar1 : bar2
      }, allBarsLeftOrRight[0])
    } else {
      return null
    }
  }

  return {
    setDragLimitsOfGanttBar
  }
}
