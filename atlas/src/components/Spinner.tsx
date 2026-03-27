import './Spinner.css'

type SpinnerProps = {
  label: string
}

export default function Spinner({ label }: SpinnerProps) {
  return (
    <div className='spinner-wrap'>
      <div className='spinner' aria-hidden='true' />
      <p>{label}</p>
    </div>
  )
}
