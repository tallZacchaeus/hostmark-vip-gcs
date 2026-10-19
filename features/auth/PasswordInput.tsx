'use client'
import { useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface PasswordInputProps {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly hasError?: boolean
  readonly autoComplete: 'current-password' | 'new-password'
  readonly describedBy?: string
  readonly autoFocus?: boolean
}

export function PasswordInput({ label, value, onChange, hasError, autoComplete, describedBy, autoFocus }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className={`auth-field ${hasError ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        <span>{label}</span>
      </label>
      <div>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)}>
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
    </div>
  )
}
