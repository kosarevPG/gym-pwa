import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./lib/api', () => ({
  fetchAllExercises: vi.fn().mockResolvedValue([]),
  fetchTrainingLogsWindow: vi.fn().mockResolvedValue([]),
  fetchExercises: vi.fn().mockResolvedValue([]),
  fetchLastExerciseSnapshot: vi.fn().mockResolvedValue(null),
  fetchLastExerciseSessionSets: vi.fn().mockResolvedValue([]),
  fetchPersonalBestWeight: vi.fn().mockResolvedValue(null),
  fetchLatestBodyWeight: vi.fn().mockResolvedValue(null),
  fetchExerciseHistory: vi.fn().mockResolvedValue([]),
  saveTrainingLogs: vi.fn().mockResolvedValue({ error: null }),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders home screen with Сегодня chip', () => {
    render(<App />);
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
  });

  it('navigates to categories when CTA clicked', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Начать тренировку|Продолжить/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Начать тренировку|Продолжить/i }));
    expect(screen.getByText('Упражнения')).toBeInTheDocument();
  });

  it('navigates to analytics when Аналитика clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Аналитика/i }));
    expect(screen.getByText(/Аналитика/i)).toBeInTheDocument();
  });
});
