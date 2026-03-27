import './ProgressDots.css'

type ProgressDotsProps = {
  activeStep: number
  totalSteps?: number
}

export default function ProgressDots({ activeStep, totalSteps = 3 }: ProgressDotsProps) {
  return (
    <div className='progress-dots' aria-label='Setup progress'>
      {Array.from({ length: totalSteps }).map((_, index) => {
        const step = index + 1
        const state = step <= activeStep ? 'active' : 'future'

        return (
          <div className='progress-node-wrap' key={step}>
            <div className={`progress-node ${state}`} />
            {step < totalSteps && <div className='progress-line' />}
          </div>
        )
      })}
    </div>
  )
}
