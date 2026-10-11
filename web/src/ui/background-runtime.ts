export interface FrameSchedulerHost {
  hidden(): boolean
  requestFrame(callback: (now: number) => void): number
  cancelFrame(id: number): void
  setTimer(callback: () => void, delay: number): number
  clearTimer(id: number): void
}

/** Agenda no máximo um quadro e um timer, ambos canceláveis na desmontagem. */
export function createFrameScheduler(host: FrameSchedulerHost, cadence: number, render: (now: number) => void) {
  let frame = 0
  let timer = 0
  let running = false

  const loop = (now: number) => {
    frame = 0
    if (!running) return
    render(now)
    timer = host.setTimer(() => {
      if (running) frame = host.requestFrame(loop)
    }, cadence)
  }

  return {
    play() {
      if (running || host.hidden()) return
      running = true
      frame = host.requestFrame(loop)
    },
    stop() {
      running = false
      if (frame) host.cancelFrame(frame)
      if (timer) host.clearTimer(timer)
      frame = 0
      timer = 0
    },
  }
}
