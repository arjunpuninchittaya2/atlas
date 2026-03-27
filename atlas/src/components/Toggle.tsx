import './Toggle.css'

type ToggleProps = {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

export default function Toggle({ checked, disabled = false, onChange }: ToggleProps) {
  return (
    <button
      type='button'
      className={`toggle ${checked ? 'checked' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span className='toggle-thumb' />
    </button>
  )
}
