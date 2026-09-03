/**
 * SchedulePicker - Reusable component for scheduling posts
 *
 * Provides date/time picker and toggle for scheduling functionality
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, X } from 'lucide-react';
import { format } from 'date-fns';

export interface ScheduleConfig {
  enabled: boolean;
  scheduledFor: Date | null;
}

interface SchedulePickerProps {
  value: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  disabled?: boolean;
}

export function SchedulePicker({ value, onChange, disabled = false }: SchedulePickerProps) {
  const [dateInput, setDateInput] = useState(
    value.scheduledFor ? format(value.scheduledFor, "yyyy-MM-dd") : ""
  );
  const [timeInput, setTimeInput] = useState(
    value.scheduledFor ? format(value.scheduledFor, "HH:mm") : ""
  );

  const handleEnabledChange = (enabled: boolean) => {
    if (!enabled) {
      onChange({ enabled: false, scheduledFor: null });
    } else {
      // Default to 1 hour from now
      const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
      setDateInput(format(defaultDate, "yyyy-MM-dd"));
      setTimeInput(format(defaultDate, "HH:mm"));
      onChange({ enabled: true, scheduledFor: defaultDate });
    }
  };

  const handleQuickSchedule = (minutes: number) => {
    const scheduledFor = new Date(Date.now() + minutes * 60 * 1000);
    setDateInput(format(scheduledFor, "yyyy-MM-dd"));
    setTimeInput(format(scheduledFor, "HH:mm"));
    onChange({ enabled: true, scheduledFor });
  };

  const handleClear = () => {
    setDateInput("");
    setTimeInput("");
    onChange({ enabled: false, scheduledFor: null });
  };

  if (!value.enabled) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Schedule for later</span>
        </div>
        <Switch
          checked={false}
          onCheckedChange={handleEnabledChange}
          disabled={disabled}
        />
      </div>
    );
  }

  const scheduledTime = value.scheduledFor
    ? format(value.scheduledFor, "MMM d, yyyy 'at' h:mm a")
    : "Select date and time";

  return (
    <div className="space-y-3 p-3 border rounded-md bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Schedule Post</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
          <Switch
            checked={true}
            onCheckedChange={handleEnabledChange}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="text-sm">
        <p className="text-muted-foreground mb-2">Scheduled for: {scheduledTime}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label htmlFor="schedule-date" className="text-xs">Date</Label>
          <Input
            id="schedule-date"
            type="date"
            value={dateInput}
            onChange={(e) => {
              setDateInput(e.target.value);
              // Trigger update when both date and time are set
              if (timeInput) {
                const newDateTime = new Date(
                  `${e.target.value}T${timeInput}`
                );
                if (!isNaN(newDateTime.getTime())) {
                  onChange({ enabled: true, scheduledFor: newDateTime });
                }
              }
            }}
            min={format(new Date(), "yyyy-MM-dd")}
            className="h-9"
          />
        </div>
        <div>
          <Label htmlFor="schedule-time" className="text-xs">Time</Label>
          <Input
            id="schedule-time"
            type="time"
            value={timeInput}
            onChange={(e) => {
              setTimeInput(e.target.value);
              // Trigger update when both date and time are set
              if (dateInput) {
                const newDateTime = new Date(
                  `${dateInput}T${e.target.value}`
                );
                if (!isNaN(newDateTime.getTime())) {
                  onChange({ enabled: true, scheduledFor: newDateTime });
                }
              }
            }}
            className="h-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Quick:</span>
        {[
          { label: '1h', minutes: 60 },
          { label: '3h', minutes: 180 },
          { label: '6h', minutes: 360 },
          { label: '12h', minutes: 720 },
          { label: '1d', minutes: 1440 },
          { label: '1w', minutes: 10080 },
        ].map(({ label, minutes }) => (
          <Button
            type="button"
            key={label}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleQuickSchedule(minutes)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
