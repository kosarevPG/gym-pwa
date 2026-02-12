import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import type { Exercise } from '../types';

vi.mock('../lib/api', () => ({
  fetchLastExerciseSnapshot: vi.fn().mockResolvedValue(null),
  fetchLastExerciseSessionSets: vi.fn().mockResolvedValue([]),
  fetchPersonalBestWeight: vi.fn().mockResolvedValue(null),
  fetchLatestBodyWeight: vi.fn().mockResolvedValue(null),
  fetchExerciseHistory: vi.fn().mockResolvedValue([]),
  saveTrainingLogs: vi.fn().mockResolvedValue({ error: null }),
}));

const mockExercise: Exercise = {
  id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
  category: 'chest',
  nameRu: 'Жим лёжа',
  nameEn: 'Bench Press',
  weightType: 'barbell',
  baseWeight: 20,
};

describe('ExerciseDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exercise name', async () => {
    render(
      <ExerciseDetailScreen
        exercise={mockExercise}
        sessionId="session-1"
        onBack={() => {}}
        onComplete={() => {}}
      />
    );
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
  });

  it('calls onComplete when Завершить упражнение clicked with no sets filled', async () => {
    const onComplete = vi.fn();
    render(
      <ExerciseDetailScreen
        exercise={mockExercise}
        sessionId="session-1"
        onBack={() => {}}
        onComplete={onComplete}
      />
    );
    const finishBtn = screen.getByRole('button', { name: /Завершить упражнение/i });
    fireEvent.click(finishBtn);
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
