import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders home screen with Gym Dashboard', () => {
    render(<App />);
    expect(screen.getByText('Gym Dashboard')).toBeInTheDocument();
  });

  it('navigates to categories when Тренировка clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Тренировка/i }));
    expect(screen.getByText('Упражнения')).toBeInTheDocument();
  });

  it('navigates to analytics when Аналитика clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Аналитика/i }));
    expect(screen.getByText(/Аналитика/i)).toBeInTheDocument();
  });
});
