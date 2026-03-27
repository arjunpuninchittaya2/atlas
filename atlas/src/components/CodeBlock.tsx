import { useState } from 'react'
import './CodeBlock.css'

type CodeBlockProps = {
  code: string
}

export default function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className='code-block-wrap'>
      <button type='button' className='copy-btn' onClick={onCopy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre>{code}</pre>
    </div>
  )
}
