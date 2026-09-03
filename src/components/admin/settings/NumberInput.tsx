import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface NumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Number input that allows temporary empty state on mobile.
 *
 * Standard controlled number inputs with `parseInt(val) || default` prevent
 * the user from clearing the field — the moment the last digit is deleted,
 * the fallback fires and the old value snaps back. This component uses a
 * local string state so the field can be temporarily empty while typing,
 * committing the number only when valid, and resetting on blur if not.
 */
export function NumberInput({ value, onChange, min, max, ...props }: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value));

  // Sync local state when the external value changes (e.g. preset applied)
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = min !== undefined && parsed < min ? min
        : max !== undefined && parsed > max ? max
        : parsed;
      onChange(clamped);
    }
  };

  const handleBlur = () => {
    const parsed = parseInt(localValue, 10);
    if (isNaN(parsed) || (min !== undefined && parsed < min)) {
      // Reset to last valid value
      setLocalValue(String(value));
    } else if (max !== undefined && parsed > max) {
      setLocalValue(String(max));
      onChange(max);
    }
  };

  return (
    <Input
      type="number"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      {...props}
    />
  );
}
