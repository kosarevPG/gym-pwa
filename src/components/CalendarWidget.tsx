import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const startDow = first.getUTCDay() || 7;
  const daysInMonth = last.getUTCDate();
  const leadingEmpty = startDow - 1;
  const totalCells = leadingEmpty + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const grid: (number | null)[][] = [];
  let day = 1;
  for (let r = 0; r < rows; r++) {
    const row: (number | null)[] = [];
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c;
      if (idx < leadingEmpty) {
        row.push(null);
      } else if (day <= daysInMonth) {
        row.push(day);
        day++;
      } else {
        row.push(null);
      }
    }
    grid.push(row);
  }
  return grid;
}

export interface CalendarWidgetProps {
  datesWithLogs: Set<string>;
  onDayClick?: (date: string) => void;
  selectedDate?: string | null;
}

export function CalendarWidget({ datesWithLogs, onDayClick, selectedDate = null }: CalendarWidgetProps) {
  const [displayDate, setDisplayDate] = useState(() => new Date());
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const grid = getMonthGrid(year, month);

  const prevMonth = () => {
    setDisplayDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setDisplayDate(new Date(year, month + 1, 1));
  };

  const monthLabel = displayDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const handleDayClick = (day: number) => {
    const dateIso = toDateOnly(new Date(Date.UTC(year, month, day)));
    onDayClick?.(dateIso);
  };

  const today = toDateOnly(new Date());

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-zinc-200 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-[10px] text-zinc-500 py-1">
            {wd}
          </div>
        ))}
        {grid.flat().map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} className="aspect-square" />;
          }
          const dateIso = toDateOnly(new Date(Date.UTC(year, month, day)));
          const hasLog = datesWithLogs.has(dateIso);
          const isSelected = selectedDate === dateIso;
          const isToday = dateIso === today;
          return (
            <button
              key={dateIso}
              type="button"
              onClick={() => handleDayClick(day)}
              className={`
                aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5
                ${isToday ? 'ring-1 ring-blue-500 text-blue-400' : 'text-zinc-300'}
                ${isSelected ? 'bg-blue-600/30' : 'hover:bg-zinc-800'}
              `}
            >
              <span>{day}</span>
              {hasLog && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
